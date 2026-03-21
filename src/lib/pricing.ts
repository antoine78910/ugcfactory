/**
 * Central pricing & credit rules (product spec).
 * Import from API routes and UI for consistent billing + margin analytics.
 */

// ---------------------------------------------------------------------------
// Global base
// ---------------------------------------------------------------------------

export const PRICING_BASE = {
  /** 1 credit sold to user */
  credit_value_usd: 0.15,
  /** Multiplier on raw API cost before margin */
  cost_buffer: 1.35,
  target_margins: {
    image: 0.55,
    video: 0.6,
    ad: 0.66,
  },
  /**
   * Approx. real cost per credit for margin tracking (spec summary).
   * revenue per credit = 0.15, cost per credit ≈ 0.0375 → ~75% margin on credit unit.
   */
  real_cost_per_credit_usd: 0.0375,
} as const;

/** Credits charged per second of Kling 3.0–style video (dynamic rule). */
export const KLING_3_VIDEO_CREDITS_PER_SECOND = 2.25;

// ---------------------------------------------------------------------------
// Images (fixed credits)
// ---------------------------------------------------------------------------

export const IMAGE_MODEL = {
  nanobanana_pro: {
    model: "nanobanana_pro",
    cost_usd: 0.1,
    cost_with_buffer: 0.135,
    target_margin: PRICING_BASE.target_margins.image,
    price_usd: 0.3,
    credits: 2,
  },
  nanobanana_standard: {
    model: "nanobanana_standard",
    cost_usd: 0.04,
    cost_with_buffer: 0.054,
    target_margin: PRICING_BASE.target_margins.image,
    price_usd: 0.12,
    credits: 1,
  },
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODEL;

export function creditsForImageModel(key: ImageModelKey): number {
  return IMAGE_MODEL[key].credits;
}

// ---------------------------------------------------------------------------
// Video — Kling 3.0 dynamic (primary)
// ---------------------------------------------------------------------------

/**
 * Backend rule: credits scale linearly with duration (Kling 3.0 family).
 * Example: 12s → ceil(27) = 27 credits.
 */
export function calculateVideoCreditsFromDuration(durationSec: number): number {
  const d = Math.max(0, Number(durationSec) || 0);
  return Math.ceil(d * KLING_3_VIDEO_CREDITS_PER_SECOND);
}

/** Reference row from spec: 12s + audio anchor (same as dynamic at 12s). */
export const KLING_3_0_12S_AUDIO_REFERENCE = {
  model: "kling_3_0_12s_audio",
  duration_sec: 12,
  cost_usd: 1.2,
  cost_with_buffer: 1.62,
  target_margin: PRICING_BASE.target_margins.video,
  price_usd: 4.05,
  credits: calculateVideoCreditsFromDuration(12),
} as const;

// ---------------------------------------------------------------------------
// Video — Sora (optional fixed tiers)
// ---------------------------------------------------------------------------

export const SORA_10S = {
  model: "sora_10s",
  cost_usd: 0.175,
  cost_with_buffer: 0.236,
  target_margin: PRICING_BASE.target_margins.video,
  price_usd: 0.59,
  credits: 4,
} as const;

/** Sora: 10s tier = 4 credits; 15s not in spec — proportional bump. */
export function calculateSoraCredits(durationSec: number): number {
  const d = Number(durationSec) || 0;
  if (d <= 10) return SORA_10S.credits;
  return 6;
}

// ---------------------------------------------------------------------------
// Ads — fixed bundle (backend must use this total)
// ---------------------------------------------------------------------------

export const AD_GENERATION_COMPOSITION = {
  images: 3,
  videos: 1,
  image_model: "nanobanana_pro" as const,
  video_model: "kling_3_0_12s_audio" as const,
} as const;

/** Fixed credits for one Link-to-Ad–style generation (do not sum line items). */
export const AD_CREDITS = 35;

export const AD_GENERATION_ECONOMICS = {
  ad_cost_usd: 1.5,
  ad_price_usd: 6.0,
  credits: AD_CREDITS,
} as const;

// ---------------------------------------------------------------------------
// Credit packs (one-off)
// ---------------------------------------------------------------------------

export const CREDIT_PACKS = [
  { price_usd: 30, credits: 200 },
  { price_usd: 60, credits: 450 },
  { price_usd: 120, credits: 1000 },
  { price_usd: 240, credits: 2200 },
  { price_usd: 480, credits: 5000 },
] as const;

// ---------------------------------------------------------------------------
// Subscriptions (monthly)
// ---------------------------------------------------------------------------

export const SUBSCRIPTIONS = [
  { price_usd: 29, credits_per_month: 240 },
  { price_usd: 59, credits_per_month: 600 },
  { price_usd: 119, credits_per_month: 1400 },
  { price_usd: 239, credits_per_month: 3200 },
] as const;

// ---------------------------------------------------------------------------
// Margin & P&L helpers (credits already consumed)
// ---------------------------------------------------------------------------

export function calculateCost(creditsUsed: number): number {
  return creditsUsed * PRICING_BASE.real_cost_per_credit_usd;
}

export function calculateRevenue(creditsUsed: number): number {
  return creditsUsed * PRICING_BASE.credit_value_usd;
}

export function calculateMargin(creditsUsed: number): number {
  const revenue = calculateRevenue(creditsUsed);
  const cost = calculateCost(creditsUsed);
  if (revenue <= 0) return 0;
  return (revenue - cost) / revenue;
}

// ---------------------------------------------------------------------------
// Video credits by marketplace model id (UI + API)
// ---------------------------------------------------------------------------

export type VideoCreditOptions = {
  modelId: string;
  duration: number;
  /** Kept for API compatibility; Kling 3.0 dynamic ignores these for credit math. */
  audio?: boolean;
  quality?: string;
};

/**
 * Video billing: dynamic duration for Kling-style models; Sora uses tier table.
 */
export function calculateVideoCreditsForModel(opts: VideoCreditOptions): number {
  const d = Math.max(0, Number(opts.duration) || 0);

  switch (opts.modelId) {
    case "openai/sora-2":
      return calculateSoraCredits(d);

    case "kling-3.0/video":
    case "kling-2.6/video":
    default:
      // Seedance, Veo, etc.: same linear rule unless you add a separate table later
      return Math.max(1, calculateVideoCreditsFromDuration(d));
  }
}

/**
 * Motion control (Kling 3.0 MC): same per-second credit curve as video.
 */
export function calculateMotionControlCreditsFromDuration(durationSeconds: number): number {
  return Math.max(1, calculateVideoCreditsFromDuration(durationSeconds));
}
