/**
 * Copy provider output (KIE / PiAPI, often ephemeral CDN) into Supabase Storage (`studio-media`).
 * Never persist third-party ephemeral URLs to `result_urls` when archival is possible but failed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDIO_MEDIA_BUCKET = "studio-media";

const PUBLIC_STUDIO_MEDIA_MARKER = "/storage/v1/object/public/studio-media/";

/** Hosts / paths that expire quickly, must be replaced by our Storage URLs. */
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

/**
 * Hard ceiling per single asset to keep us well under Vercel function memory.
 * Anything bigger is left as a provider URL; cron will retry with a fatter budget.
 */
const MAX_LIVE_ARCHIVAL_BYTES_PER_ASSET = 60 * 1024 * 1024; // 60 MB
const MAX_CRON_ARCHIVAL_BYTES_PER_ASSET = 200 * 1024 * 1024; // 200 MB

async function fetchMediaBytes(
  url: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    try {
      const target = new URL(url);
      const res = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
        headers: {
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0 (compatible; YouryStudio/1.0; archival)",
          // Some providers enforce anti-hotlink checks.
          Referer: `${target.origin}/`,
          Origin: target.origin,
        },
      });
      lastStatus = res.status;
      if (!res.ok || !res.body) continue;

      const declaredLengthRaw = res.headers.get("content-length");
      const declaredLength = declaredLengthRaw ? Number(declaredLengthRaw) : NaN;
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        // Skip oversized assets entirely; they will keep the provider URL and be
        // retried later by the cron with a fatter budget (or kept as-is forever
        // if the URL is stable).
        try {
          await res.body.cancel();
        } catch {
          /* ignore */
        }
        return null;
      }

      // Stream-read so we can early-abort once we cross the soft cap, instead
      // of letting `arrayBuffer()` allocate the entire buffer up-front. This
      // keeps peak memory bounded under high concurrency.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let oversized = false;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > maxBytes) {
            oversized = true;
            break;
          }
          chunks.push(value);
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
      }

      if (oversized) {
        try {
          await res.body.cancel();
        } catch {
          /* ignore */
        }
        return null;
      }
      if (total === 0) continue;

      const contentType = res.headers.get("content-type") ?? "";
      const buffer = Buffer.concat(chunks, total);
      // Help GC: drop refs to the per-chunk views we just concatenated.
      chunks.length = 0;
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
 * Mutable cross-call accounting so a single HTTP request that polls many rows can
 * cap how much it spends on Supabase Storage archival. Exhausting the budget
 * makes subsequent calls return provider URLs unchanged (cron will catch up).
 */
export type StudioMediaArchivalBudget = {
  /** Max number of inline (live) archivals across all calls sharing this budget. */
  remainingArchivals: number;
  /** Optional total-bytes ceiling. */
  remainingBytes?: number;
};

export type PersistStudioMediaMode = "live" | "cron";

export function createLivePollArchivalBudget(): StudioMediaArchivalBudget {
  // Live (per HTTP request) budget. Empirically sized to fit comfortably inside
  // a 1024 MB Vercel function while concurrent invocations share the instance.
  return {
    remainingArchivals: 4,
    remainingBytes: 200 * 1024 * 1024, // 200 MB total per request
  };
}

/**
 * Re-upload remote media into `studio-media`. URLs already pointing at this bucket are kept as-is.
 *
 * In `"live"` mode (default), only **truly ephemeral** URLs are archived inline; stable
 * provider URLs (Kling/Veo/Kie/etc.) are returned unchanged so the request stays cheap
 * and the cron can archive them in the background.
 *
 * In `"cron"` mode, all non-bucket URLs are archived (cron has bigger memory budget).
 */
export async function persistStudioMediaUrls(opts: {
  admin: SupabaseClient;
  userId: string;
  rowId: string;
  urls: string[];
  mode?: PersistStudioMediaMode;
  budget?: StudioMediaArchivalBudget;
}): Promise<PersistStudioMediaResult> {
  const out: string[] = [];
  const inputs = opts.urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  const mode: PersistStudioMediaMode = opts.mode ?? "live";
  const maxBytesPerAsset =
    mode === "cron" ? MAX_CRON_ARCHIVAL_BYTES_PER_ASSET : MAX_LIVE_ARCHIVAL_BYTES_PER_ASSET;

  for (let i = 0; i < inputs.length; i++) {
    const src = inputs[i]!;
    if (isStudioMediaPublicUrl(src)) {
      out.push(src);
      continue;
    }

    // Live mode: only archive provider URLs that are known to expire fast.
    // Stable URLs are kept as-is; the cron will archive them in background.
    if (mode === "live" && !isEphemeralOrUnstableMediaUrl(src)) {
      out.push(src);
      continue;
    }

    // Honor per-request budgets (live mode). When exhausted, keep originals.
    if (opts.budget) {
      if (opts.budget.remainingArchivals <= 0) {
        out.push(src);
        continue;
      }
      if (
        typeof opts.budget.remainingBytes === "number" &&
        opts.budget.remainingBytes <= 0
      ) {
        out.push(src);
        continue;
      }
    }

    const downloaded = await fetchMediaBytes(src, maxBytesPerAsset);
    if (!downloaded) {
      // Keep original URL as fallback, cron backfill will retry archival later.
      out.push(src);
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

    if (opts.budget) {
      opts.budget.remainingArchivals = Math.max(0, opts.budget.remainingArchivals - 1);
      if (typeof opts.budget.remainingBytes === "number") {
        opts.budget.remainingBytes = Math.max(0, opts.budget.remainingBytes - buffer.length);
      }
    }

    if (error || !data?.path) {
      console.error(`[persistStudioMedia] upload error:`, error?.message ?? error);
      // Keep original URL as fallback rather than silently dropping it.
      out.push(src);
      continue;
    }

    const {
      data: { publicUrl },
    } = opts.admin.storage.from(STUDIO_MEDIA_BUCKET).getPublicUrl(data.path);
    if (publicUrl) out.push(publicUrl);
    else out.push(src); // getPublicUrl shouldn't fail, but keep fallback just in case
  }

  // complete = every URL is now on our Supabase Storage (no more third-party CDN URLs)
  const complete = inputs.length > 0 && out.every(isStudioMediaPublicUrl);
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
