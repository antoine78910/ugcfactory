/**
 * Credit estimates for all generation types.
 *
 * Pricing rule: 70 % gross margin on the base credit value ($0.15 / credit
 * from the Starter pack).  Formula: credits = ceil(apiCost / 0.045).
 */

// ---------------------------------------------------------------------------
// Image credits
// ---------------------------------------------------------------------------

export const CREDITS_NANO_PRO_PER_IMAGE = 2;
export const CREDITS_LINK_TO_AD_THREE_REF_IMAGES = CREDITS_NANO_PRO_PER_IMAGE * 3;

// ---------------------------------------------------------------------------
// Link-to-Ad video (Kling 3.0, ~5 s, 720 p, no audio → 2 × 5 = 10)
// ---------------------------------------------------------------------------

export const CREDITS_KLING_LINK_TO_AD_VIDEO = 10;

// ---------------------------------------------------------------------------
// Video generation — dynamic per model / duration / audio / quality
// ---------------------------------------------------------------------------

export function calculateVideoCredits(opts: {
  modelId: string;
  duration: number;
  audio: boolean;
  quality: string; // "std" | "pro" for Kling 3.0 (720p / 1080p)
}): number {
  const { modelId, duration, audio, quality } = opts;

  switch (modelId) {
    case "kling-3.0/video": {
      const is1080 = quality === "pro";
      const ratePerSec =
        is1080 && audio ? 3 : is1080 && !audio ? 2 : audio ? 3 : 2;
      return Math.max(1, ratePerSec * duration);
    }

    case "kling-2.6/video": {
      if (duration <= 5) return audio ? 13 : 7;
      return audio ? 25 : 13;
    }

    case "openai/sora-2": {
      return duration <= 10 ? 4 : 5;
    }

    // Seedance / Veo — flat rate (no per-second pricing published)
    default:
      return 21;
  }
}

// ---------------------------------------------------------------------------
// Motion Control — per-second pricing, 70 % margin
// ---------------------------------------------------------------------------

export function calculateMotionControlCredits(opts: {
  quality: string; // "720p" | "1080p"
  durationSeconds: number;
}): number {
  const ratePerSec = opts.quality === "1080p" ? 3 : 2;
  return Math.max(1, Math.ceil(ratePerSec * opts.durationSeconds));
}
