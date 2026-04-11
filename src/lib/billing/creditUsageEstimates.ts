/**
 * Marketing copy: “up to N images / videos” from a credit balance.
 * Same rules on /subscription, /credits, and CreditsPlanContext tiers.
 */

export const CREDITS_PER_ESTIMATE_NANOBANANA_IMAGE = 0.5;
export const CREDITS_PER_ESTIMATE_SORA2_VIDEO = 5;

export function upToEstimateAiImagesFromCredits(credits: number): number {
  return Math.max(1, Math.floor(credits / CREDITS_PER_ESTIMATE_NANOBANANA_IMAGE));
}

export function upToEstimateAiVideosFromCredits(credits: number): number {
  return Math.max(1, Math.floor(credits / CREDITS_PER_ESTIMATE_SORA2_VIDEO));
}
