/**
 * KIE Market Gemini Omni Video — credits, params, quota.
 * @see https://docs.kie.ai/market/gemini-omni-video
 */

export const GEMINI_OMNI_VIDEO_MODEL_ID = "gemini-omni-video" as const;

export type GeminiOmniVideoResolution = "720p" | "1080p" | "4k";
export type GeminiOmniVideoDurationSec = 4 | 6 | 8 | 10;
export type GeminiOmniVideoAspectRatio = "16:9" | "9:16";

export function mapWorkflowAspectToGeminiOmni(aspect: string | undefined): GeminiOmniVideoAspectRatio {
  const a = (aspect ?? "").trim();
  if (a === "9:16") return "9:16";
  return "16:9";
}

/** Provider max clip span inside `video_list` (ends − start). */
export const GEMINI_OMNI_MAX_VIDEO_CLIP_SEC = 10;

/** Max reference images in `image_urls`. */
export const GEMINI_OMNI_MAX_IMAGE_URLS = 7;

/** Max source videos per request (`video_list`). */
export const GEMINI_OMNI_MAX_VIDEO_LIST_ITEMS = 1;

/** Total quota units (images×1 + videos×2 + character_ids×1). */
export const GEMINI_OMNI_QUOTA_UNITS_MAX = 7;

const DURATION_OPTS: GeminiOmniVideoDurationSec[] = [4, 6, 8, 10];

/** Fixed credits per provider sheet (per video). */
const CREDITS_WITH_VIDEO_INPUT: Record<GeminiOmniVideoResolution, number> = {
  "4k": 360,
  "1080p": 240,
  "720p": 240,
};

const CREDITS_NO_VIDEO_INPUT: Record<
  GeminiOmniVideoDurationSec,
  Record<GeminiOmniVideoResolution, number>
> = {
  4: { "720p": 90, "1080p": 90, "4k": 210 },
  6: { "720p": 120, "1080p": 120, "4k": 240 },
  8: { "720p": 150, "1080p": 150, "4k": 270 },
  10: { "720p": 180, "1080p": 180, "4k": 300 },
};

export function studioVideoIsGeminiOmniPickerId(pickerId: string): boolean {
  return pickerId.trim() === GEMINI_OMNI_VIDEO_MODEL_ID;
}

export function normalizeGeminiOmniResolution(raw: string | undefined): GeminiOmniVideoResolution {
  const t = (raw ?? "720p").trim().toLowerCase();
  if (t === "4k" || t === "2160p") return "4k";
  if (t === "1080p") return "1080p";
  return "720p";
}

export function coerceGeminiOmniDurationSec(raw: number | undefined): GeminiOmniVideoDurationSec {
  const n = Number(raw);
  if (n === 4 || n === 6 || n === 8 || n === 10) return n;
  if (!Number.isFinite(n)) return 8;
  if (n <= 5) return 4;
  if (n <= 7) return 6;
  if (n <= 9) return 8;
  return 10;
}

export function geminiOmniDurationSecOptions(): string[] {
  return DURATION_OPTS.map(String);
}

export function geminiOmniQuotaUnitsUsed(opts: {
  imageCount: number;
  videoCount: number;
  characterIdCount: number;
}): number {
  return (
    Math.max(0, opts.imageCount) +
    Math.max(0, opts.videoCount) * 2 +
    Math.max(0, opts.characterIdCount)
  );
}

export function calculateGeminiOmniVideoCredits(opts: {
  durationSec: number;
  resolution: GeminiOmniVideoResolution;
  hasVideoInput: boolean;
}): number {
  const resolution = normalizeGeminiOmniResolution(opts.resolution);
  if (opts.hasVideoInput) {
    return CREDITS_WITH_VIDEO_INPUT[resolution];
  }
  const duration = coerceGeminiOmniDurationSec(opts.durationSec);
  return CREDITS_NO_VIDEO_INPUT[duration][resolution];
}

export type GeminiOmniVideoListItem = {
  url: string;
  start: number;
  ends: number;
};

export function normalizeGeminiVideoListItem(
  raw: { url?: unknown; start?: unknown; ends?: unknown },
): { ok: true; item: GeminiOmniVideoListItem } | { ok: false; error: string } {
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) return { ok: false, error: "Video clip URL is required." };
  const start = Number(raw.start);
  const ends = Number(raw.ends);
  if (!Number.isFinite(start) || start < 0) {
    return { ok: false, error: "Video clip `start` must be a non-negative number." };
  }
  if (!Number.isFinite(ends) || ends <= start) {
    return { ok: false, error: "Video clip `ends` must be greater than `start`." };
  }
  const span = ends - start;
  if (span > GEMINI_OMNI_MAX_VIDEO_CLIP_SEC + 0.001) {
    return {
      ok: false,
      error: `Video clip span must be at most ${GEMINI_OMNI_MAX_VIDEO_CLIP_SEC} seconds.`,
    };
  }
  return { ok: true, item: { url, start, ends } };
}
