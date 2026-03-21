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

// ---------------------------------------------------------------------------
// Video (Link to Ad default clip length 12s → ceil(12 × 2.25) = 27)
// ---------------------------------------------------------------------------

export const LINK_TO_AD_VIDEO_DURATION_SEC = 12;
export const CREDITS_KLING_LINK_TO_AD_VIDEO = calculateVideoCreditsFromDuration(
  LINK_TO_AD_VIDEO_DURATION_SEC,
);

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
  void opts.quality; // quality reserved for future tiered pricing
  return calculateMotionControlCreditsFromDuration(opts.durationSeconds);
}
