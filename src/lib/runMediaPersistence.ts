/**
 * Mirror provider-hosted (often ephemeral) media URLs found anywhere in a `ugc_runs` row
 * (Link to Ad / Workflow projects) into Supabase Storage so the user always keeps access.
 *
 * Vulnerable surfaces this module covers:
 *   - `selected_image_url` (single)
 *   - `video_url` (single)
 *   - `generated_image_urls` (array)
 *   - `packshot_urls` (array)
 *   - `extracted` (jsonb) — recursively scans every string value
 *
 * The mirror itself is delegated to `persistStudioMediaUrls` (writes to `studio-media`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isEphemeralOrUnstableMediaUrl,
  isStudioMediaPublicUrl,
  persistStudioMediaUrls,
} from "@/lib/studioGenerationsMedia";

/** Marker for any object served by our Supabase Storage (public or signed, any bucket). */
function isOurSupabaseStorageUrl(url: string): boolean {
  return /\/storage\/v1\/object\/(public|sign)\//i.test(url);
}

/**
 * Returns true if the URL points at media we should clone into our storage.
 * Errs on the side of NOT cloning generic (non-media) http URLs, e.g. product page links.
 */
export function looksLikeProviderMediaUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  if (isOurSupabaseStorageUrl(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  // Drop the query string before extension matching so `?token=...` does not hide the extension.
  const beforeQuery = lower.split(/[?#]/)[0];
  if (/\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|m4a|mp3|wav|ogg)$/i.test(beforeQuery)) return true;
  if (isEphemeralOrUnstableMediaUrl(trimmed)) return true;
  // Known provider CDNs that may rotate / expire URLs.
  if (lower.includes("fal.media")) return true;
  if (lower.includes("delivery-eu1.bfl.ai")) return true;
  if (lower.includes("replicate.delivery")) return true;
  if (lower.includes("klingai.com")) return true;
  if (lower.includes("kuaishou-ai")) return true;
  if (lower.includes("kie.ai/files")) return true;
  if (lower.includes("kie-cdn.")) return true;
  if (lower.includes("piapi-")) return true;
  if (lower.includes("img.bytedance")) return true;
  if (lower.includes("ark-content-generation")) return true;
  if (lower.includes("oaiusercontent.com")) return true;
  if (lower.includes("openai-labs")) return true;
  return false;
}

type RunMediaPayload = {
  selected_image_url?: string | null;
  video_url?: string | null;
  generated_image_urls?: string[] | null;
  packshot_urls?: string[] | null;
  extracted?: unknown;
};

function collectUrls(payload: RunMediaPayload): Set<string> {
  const out = new Set<string>();
  const note = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t) return;
    if (looksLikeProviderMediaUrl(t)) out.add(t);
  };
  note(payload.selected_image_url);
  note(payload.video_url);
  for (const u of payload.generated_image_urls ?? []) note(u);
  for (const u of payload.packshot_urls ?? []) note(u);
  if (payload.extracted !== undefined) walkJsonStrings(payload.extracted, note);
  return out;
}

function walkJsonStrings(node: unknown, visit: (s: string) => void): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    visit(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkJsonStrings(item, visit);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) walkJsonStrings(v, visit);
  }
}

function mapJsonStrings<T>(node: T, transform: (s: string) => string): T {
  if (node === null || node === undefined) return node;
  if (typeof node === "string") return transform(node) as unknown as T;
  if (Array.isArray(node)) return node.map((item) => mapJsonStrings(item, transform)) as unknown as T;
  if (typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = mapJsonStrings(v, transform);
    }
    return out as unknown as T;
  }
  return node;
}

export type MirrorRunMediaResult = {
  payload: RunMediaPayload;
  /** Number of URLs successfully replaced by `studio-media` URLs. */
  mirroredCount: number;
  /** Total candidate URLs found (including those that failed to mirror). */
  candidateCount: number;
  /** True when at least one URL changed → caller should write to DB. */
  changed: boolean;
};

/**
 * Returns a deep-cloned copy of `payload` where every provider-hosted media URL has been
 * replaced by a permanent `studio-media` URL whenever archival succeeded.
 * URLs that fail to archive are kept as-is so the cron backfill can retry later.
 */
export async function mirrorRunMediaUrls(opts: {
  admin: SupabaseClient;
  userId: string;
  rowId: string;
  payload: RunMediaPayload;
}): Promise<MirrorRunMediaResult> {
  const candidates = [...collectUrls(opts.payload)];
  if (candidates.length === 0) {
    return { payload: opts.payload, mirroredCount: 0, candidateCount: 0, changed: false };
  }

  const { urls } = await persistStudioMediaUrls({
    admin: opts.admin,
    userId: opts.userId,
    rowId: opts.rowId,
    urls: candidates,
  });

  const replacement = new Map<string, string>();
  let mirroredCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    const src = candidates[i]!;
    const dst = urls[i] ?? src;
    if (dst !== src && isStudioMediaPublicUrl(dst)) {
      replacement.set(src, dst);
      mirroredCount++;
    }
  }

  if (mirroredCount === 0) {
    return { payload: opts.payload, mirroredCount: 0, candidateCount: candidates.length, changed: false };
  }

  const replace = (s: string): string => replacement.get(s) ?? s;
  const out: RunMediaPayload = { ...opts.payload };
  if (typeof out.selected_image_url === "string") out.selected_image_url = replace(out.selected_image_url);
  if (typeof out.video_url === "string") out.video_url = replace(out.video_url);
  if (Array.isArray(out.generated_image_urls)) {
    out.generated_image_urls = out.generated_image_urls.map((u) => (typeof u === "string" ? replace(u) : u));
  }
  if (Array.isArray(out.packshot_urls)) {
    out.packshot_urls = out.packshot_urls.map((u) => (typeof u === "string" ? replace(u) : u));
  }
  if (out.extracted !== undefined) {
    out.extracted = mapJsonStrings(out.extracted, (s) => (looksLikeProviderMediaUrl(s) ? replace(s) : s));
  }
  return { payload: out, mirroredCount, candidateCount: candidates.length, changed: true };
}

/** Quick check: does any string anywhere in a row look like a provider-hosted media URL? */
export function rowHasUnpersistedMedia(row: {
  selected_image_url?: string | null;
  video_url?: string | null;
  generated_image_urls?: string[] | null;
  packshot_urls?: string[] | null;
  extracted?: unknown;
}): boolean {
  let found = false;
  const stop = () => {
    found = true;
  };
  const check = (v: unknown) => {
    if (found) return;
    if (typeof v === "string" && looksLikeProviderMediaUrl(v)) stop();
  };
  check(row.selected_image_url);
  check(row.video_url);
  for (const u of row.generated_image_urls ?? []) {
    if (found) break;
    check(u);
  }
  for (const u of row.packshot_urls ?? []) {
    if (found) break;
    check(u);
  }
  if (!found && row.extracted !== undefined) {
    walkJsonStrings(row.extracted, (s) => {
      if (!found && looksLikeProviderMediaUrl(s)) stop();
    });
  }
  return found;
}
