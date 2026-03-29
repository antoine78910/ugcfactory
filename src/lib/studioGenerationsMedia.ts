/**
 * Copy provider output (KIE / PiAPI, often ephemeral CDN) into Supabase Storage (`studio-media`).
 * Never persist third-party ephemeral URLs to `result_urls` when archival is possible but failed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDIO_MEDIA_BUCKET = "studio-media";

const PUBLIC_STUDIO_MEDIA_MARKER = "/storage/v1/object/public/studio-media/";

/** Hosts / paths that expire quickly — must be replaced by our Storage URLs. */
export function isEphemeralOrUnstableMediaUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (u.includes("theapi.app")) return true;
  if (u.includes("/ephemeral/")) return true;
  if (u.includes("temp.") && u.includes("cdn")) return true;
  return false;
}

export function isStudioMediaPublicUrl(url: string): boolean {
  return url.includes(PUBLIC_STUDIO_MEDIA_MARKER);
}

function guessExtensionFromUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  const lower = u.toLowerCase();
  if (lower.includes(".mp4")) return ".mp4";
  if (lower.includes(".mov")) return ".mov";
  if (lower.includes(".webm")) return ".webm";
  if (lower.includes(".png")) return ".png";
  if (lower.includes(".webp")) return ".webp";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return ".jpg";
  return "";
}

function guessExtensionFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (!ct) return "";
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
  };
  return map[ct] ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchMediaBytes(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
        headers: {
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0 (compatible; YouryStudio/1.0; archival)",
        },
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      const buffer = Buffer.from(bytes);
      if (buffer.length === 0) continue;
      const contentType = res.headers.get("content-type") ?? "";
      return { buffer, contentType };
    } catch {
      /* retry */
    }
  }
  console.warn(`[persistStudioMedia] fetch failed after retries HTTP ${lastStatus} ${url.slice(0, 100)}`);
  return null;
}

export type PersistStudioMediaResult = {
  urls: string[];
  /** True when every input URL was either already on our bucket or successfully re-uploaded. */
  complete: boolean;
};

/**
 * Re-upload remote media into `studio-media`. URLs already pointing at this bucket are kept as-is.
 */
export async function persistStudioMediaUrls(opts: {
  admin: SupabaseClient;
  userId: string;
  rowId: string;
  urls: string[];
}): Promise<PersistStudioMediaResult> {
  const out: string[] = [];
  const inputs = opts.urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));

  for (let i = 0; i < inputs.length; i++) {
    const src = inputs[i]!;
    if (isStudioMediaPublicUrl(src)) {
      out.push(src);
      continue;
    }

    const downloaded = await fetchMediaBytes(src);
    if (!downloaded) {
      continue;
    }

    const { buffer, contentType } = downloaded;
    const ext = guessExtensionFromContentType(contentType) || guessExtensionFromUrl(src) || "";
    const filename = `${crypto.randomUUID()}${ext}`;
    const storagePath = `${opts.userId}/${opts.rowId}/${i + 1}-${filename}`;

    const { data, error } = await opts.admin.storage.from(STUDIO_MEDIA_BUCKET).upload(storagePath, buffer, {
      contentType: contentType || undefined,
      upsert: false,
    });
    if (error || !data?.path) {
      console.error(`[persistStudioMedia] upload error:`, error?.message ?? error);
      continue;
    }

    const {
      data: { publicUrl },
    } = opts.admin.storage.from(STUDIO_MEDIA_BUCKET).getPublicUrl(data.path);
    if (publicUrl) out.push(publicUrl);
  }

  const complete = out.length === inputs.length && inputs.length > 0;
  return { urls: out, complete };
}

/** Extract storage object path from a public Supabase URL for `studio-media`. */
export function studioMediaObjectPathFromPublicUrl(url: string): string | null {
  const i = url.indexOf(PUBLIC_STUDIO_MEDIA_MARKER);
  if (i === -1) return null;
  const rest = url.slice(i + PUBLIC_STUDIO_MEDIA_MARKER.length).split("?")[0];
  try {
    return decodeURIComponent(rest ?? "");
  } catch {
    return rest ?? null;
  }
}

const RETENTION_MONTHS = 6;

/** `created_at` older than this should have storage objects removed (see retention sweep). */
export function studioMediaRetentionCutoffIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d.toISOString();
}

export function studioMediaRetentionMonths(): number {
  return RETENTION_MONTHS;
}

/**
 * Delete stored objects for this row's `result_urls` and clear URLs in DB.
 */
export async function deleteStudioMediaForRow(
  admin: SupabaseClient,
  resultUrls: string[] | null,
): Promise<{ pathsRemoved: string[] }> {
  const paths: string[] = [];
  for (const u of resultUrls ?? []) {
    const p = studioMediaObjectPathFromPublicUrl(u.trim());
    if (p) paths.push(p);
  }
  if (paths.length === 0) return { pathsRemoved: [] };
  const { error } = await admin.storage.from(STUDIO_MEDIA_BUCKET).remove(paths);
  if (error) {
    console.warn("[studioMediaRetention] remove:", error.message);
  }
  return { pathsRemoved: paths };
}
