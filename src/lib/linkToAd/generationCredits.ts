/**
 * Link-to-Ad & studio generation credits.
 * Source of truth: `@/lib/pricing` (spec: dynamic video, fixed ads, image tiers).
 */

import {
  AD_CREDITS,
  CLAUDE_AI_CREDITS,
  IMAGE_MODEL,
  LINK_TO_AD_VIDEO_MODELS,
  LINK_TO_AD_VIDEO_MARKET_MODEL,
  type LinkToAdSeedanceSpeed,
  type LinkToAdVideoModelId,
  calculateMotionControlCreditsFromDuration,
  calculateVideoCreditsForModel,
  calculateVideoCreditsFromDuration,
  linkToAdSeedanceMarketModel,
  linkToAdVideoCredits,
} from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Image credits
// ---------------------------------------------------------------------------

export const CREDITS_NANO_PRO_PER_IMAGE = IMAGE_MODEL.nanobanana_pro.credits;
export const CREDITS_NANO_STANDARD_PER_IMAGE = IMAGE_MODEL.nanobanana_standard.credits;
export const CREDITS_LINK_TO_AD_THREE_REF_IMAGES = CREDITS_NANO_PRO_PER_IMAGE * 3;

/**
 * Shown on first "Generate" from store URL (site scan + brand + UGC scripts).
 * Tune when API routes deduct credits per step.
 */
export const CREDITS_LINK_TO_AD_STORE_SCAN = 8;

/** Claude AI step: video prompt generation. */
export const CREDITS_LINK_TO_AD_VIDEO_PROMPT_AI = CLAUDE_AI_CREDITS;

// ---------------------------------------------------------------------------
// Video — dynamic pricing by model + duration (Link to Ad)
// ---------------------------------------------------------------------------

export {
  linkToAdVideoCredits,
  LINK_TO_AD_VIDEO_MODELS,
  LINK_TO_AD_VIDEO_MARKET_MODEL,
  linkToAdSeedanceMarketModel,
};
export type { LinkToAdVideoModelId, LinkToAdSeedanceSpeed };

export const LINK_TO_AD_DEFAULT_VIDEO_MODEL: LinkToAdVideoModelId = "seedance";
/** Default Link to Ad clip length (UI + pipeline when not persisted). 30s is gated in UI (“Soon”). */
export const LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC = 15;

export function creditsLinkToAdVideoFromImage(
  model: LinkToAdVideoModelId,
  durationSec: number,
  seedanceSpeed: LinkToAdSeedanceSpeed = "normal",
): number {
  return linkToAdVideoCredits(model, durationSec, seedanceSpeed);
}

export function creditsLinkToAdFullPipeline(
  model: LinkToAdVideoModelId,
  durationSec: number,
  seedanceSpeed: LinkToAdSeedanceSpeed = "normal",
): number {
  void durationSec;
  return creditsLinkToAdVideoFromImage(model, durationSec, seedanceSpeed);
}

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
