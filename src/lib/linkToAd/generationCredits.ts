/**
 * Link-to-Ad & studio generation credits.
 * Source of truth: `@/lib/pricing` (spec: dynamic video, fixed ads, image tiers).
 */

import {
  AD_CREDITS,
  IMAGE_MODEL,
  calculateMotionControlCreditsFromDuration,
  calculateVideoCreditsForModel,
  calculateVideoCreditsFromDuration,
} from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Image credits
// ---------------------------------------------------------------------------

export const CREDITS_NANO_PRO_PER_IMAGE = IMAGE_MODEL.nanobanana_pro.credits;
export const CREDITS_NANO_STANDARD_PER_IMAGE = IMAGE_MODEL.nanobanana_standard.credits;
export const CREDITS_LINK_TO_AD_THREE_REF_IMAGES = CREDITS_NANO_PRO_PER_IMAGE * 3;

/**
 * Shown on first “Generate” from store URL (site scan + brand + UGC scripts GPT).
 * Tune when API routes deduct credits per step.
 */
export const CREDITS_LINK_TO_AD_STORE_SCAN = 8;

/** GPT step: motion / UGC video prompt (Link to Ad). Shown on “Retry video prompt”. */
export const CREDITS_LINK_TO_AD_VIDEO_PROMPT_GPT = 2;

// ---------------------------------------------------------------------------
// Video (Link to Ad default clip length 12s → ceil(12 × 2.25) = 27)
// ---------------------------------------------------------------------------

export const LINK_TO_AD_VIDEO_DURATION_SEC = 12;
export const CREDITS_KLING_LINK_TO_AD_VIDEO = calculateVideoCreditsFromDuration(
  LINK_TO_AD_VIDEO_DURATION_SEC,
);

/** One-shot “Generate video from this image” = motion prompt GPT + default Kling clip. */
export const CREDITS_LINK_TO_AD_VIDEO_FROM_IMAGE =
  CREDITS_LINK_TO_AD_VIDEO_PROMPT_GPT + CREDITS_KLING_LINK_TO_AD_VIDEO;

/** Scan + 3 reference images + one default Link-to-Ad video (happy path). */
export const CREDITS_LINK_TO_AD_FULL_PIPELINE =
  CREDITS_LINK_TO_AD_STORE_SCAN +
  CREDITS_LINK_TO_AD_THREE_REF_IMAGES +
  CREDITS_LINK_TO_AD_VIDEO_FROM_IMAGE;

/** Same as `CREDITS_LINK_TO_AD_FULL_PIPELINE` — debited on Link-to-Ad “Generate” from URL (must match the button). */
export const CREDITS_LINK_TO_AD_GENERATE_FROM_URL = CREDITS_LINK_TO_AD_FULL_PIPELINE;

/** Full ad bundle — backend must bill this fixed amount, not sum of parts. */
export { AD_CREDITS as CREDITS_AD_GENERATION };
export { AD_CREDITS };

// ---------------------------------------------------------------------------
// Video generation — dynamic by duration (studio)
// ---------------------------------------------------------------------------

export function calculateVideoCredits(opts: {
  modelId: string;
  duration: number;
  audio: boolean;
  quality: string;
}): number {
  return calculateVideoCreditsForModel({
    modelId: opts.modelId,
    duration: opts.duration,
    audio: opts.audio,
    quality: opts.quality,
  });
}

export { calculateVideoCreditsFromDuration };

// ---------------------------------------------------------------------------
// Motion control — same curve as Kling 3.0 video length
// ---------------------------------------------------------------------------

export function calculateMotionControlCredits(opts: {
  quality: string;
  durationSeconds: number;
}): number {
  return calculateMotionControlCreditsFromDuration(opts.durationSeconds, opts.quality);
}
