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

/** Pro / Standard studio UI — same resolution keys as NanoBanana Pro API. */
export type StudioImageOutputResolution = "1K" | "2K" | "4K";

/**
 * Credits per generated image in Studio (model + output resolution).
 * Pro anchors on `nanobanana_pro.credits` at 2K (1K = half, 4K = double).
 * Standard anchors on `nanobanana_standard.credits` at 1K (2K/4K scale up).
 */
export function studioImageCreditsPerOutput(opts: {
  studioModel: "pro" | "nano";
  resolution: StudioImageOutputResolution;
}): number {
  if (opts.studioModel === "pro") {
    const base = IMAGE_MODEL.nanobanana_pro.credits;
    const mult = { "1K": 0.5, "2K": 1, "4K": 2 } as const;
    return Math.max(1, Math.ceil(base * mult[opts.resolution]));
  }
  const base = IMAGE_MODEL.nanobanana_standard.credits;
  const mult = { "1K": 1, "2K": 2, "4K": 3 } as const;
  return Math.max(1, Math.ceil(base * mult[opts.resolution]));
}

// ---------------------------------------------------------------------------
// Video — Kling 3.0 dynamic (primary)
// ---------------------------------------------------------------------------

/**
 * Kling 3.0 / 2.6 — quality + audio multipliers (ratios vs 1080p + audio anchor).
 * Anchor: 2.25 credits/s at 1080p + audio (e.g. 12s → 27 credits).
 */
export function is1080pVideoQuality(quality: string | undefined): boolean {
  return quality === "pro" || quality === "1080p";
}

/** Multiplier on (duration × KLING_3_VIDEO_CREDITS_PER_SECOND). */
export function kling30CreditsMultiplier(quality: string | undefined, audio: boolean): number {
  const is1080 = is1080pVideoQuality(quality);
  if (is1080 && audio) return 1;
  if (is1080 && !audio) return 18 / 27;
  if (!is1080 && audio) return 20 / 27;
  return 14 / 27;
}

/**
 * Kling 3.0–style video credits (studio + API).
 */
export function calculateKling30VideoCredits(
  durationSec: number,
  quality: string | undefined,
  audio: boolean,
): number {
  const d = Math.max(0, Number(durationSec) || 0);
  const mult = kling30CreditsMultiplier(quality, audio);
  return Math.max(1, Math.ceil(d * KLING_3_VIDEO_CREDITS_PER_SECOND * mult));
}

/**
 * Shorthand: anchor tier only (1080p + audio). For legacy call sites.
 * Example: 12s → 27 credits.
 */
export function calculateVideoCreditsFromDuration(durationSec: number): number {
  return calculateKling30VideoCredits(durationSec, "pro", true);
}

/** Reference row from spec: 12s + audio @ 1080p. */
export const KLING_3_0_12S_AUDIO_REFERENCE = {
  model: "kling_3_0_12s_audio",
  duration_sec: 12,
  cost_usd: 1.2,
  cost_with_buffer: 1.62,
  target_margin: PRICING_BASE.target_margins.video,
  price_usd: 4.05,
  credits: calculateKling30VideoCredits(12, "pro", true),
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
  /** Kling: sound on/off. */
  audio?: boolean;
  /** Kling studio: `std` = 720p, `pro` = 1080p. Motion: `720p` / `1080p`. */
  quality?: string;
};

/**
 * Video billing: Kling uses duration × quality × audio; Sora uses tier table.
 */
export function calculateVideoCreditsForModel(opts: VideoCreditOptions): number {
  const d = Math.max(0, Number(opts.duration) || 0);
  const audio = Boolean(opts.audio);
  const quality = opts.quality;

  switch (opts.modelId) {
    case "openai/sora-2":
      return calculateSoraCredits(d);

    case "kling-3.0/video":
    case "kling-2.6/video":
      return calculateKling30VideoCredits(d, quality, audio);

    default:
      // Seedance, Veo, etc.: anchor tier until per-model tables exist
      return Math.max(1, calculateKling30VideoCredits(d, "pro", true));
  }
}

/**
 * Studio Edit Video tab — `studio-edit/…` picker ids.
 * Edit jobs bill like Kling 3.0 length × quality; motion pickers use motion-control curve.
 */
export function calculateStudioVideoEditCredits(opts: {
  editPickerId: string;
  /** Seconds from uploaded source video (edit) or fallback (e.g. 10). */
  editDurationSec: number;
  /** Motion reference clip length when picker is motion. */
  motionDurationSec?: number;
  /** Sidebar quality: std | pro (720p / 1080p). */
  quality: string;
  /** When true, treat quality as Pro for non-motion models. */
  autoSettings: boolean;
}): number {
  const id = opts.editPickerId.trim();
  const motion = id === "studio-edit/motion" || id === "studio-edit/motion-v3";
  if (motion) {
    const d = Math.max(0, Number(opts.motionDurationSec) || 0);
    const q = normalizeMotionControlQuality(opts.quality);
    return calculateMotionControlCreditsFromDuration(d, q);
  }
  const d = Math.max(1, Number(opts.editDurationSec) || 10);
  const q = opts.autoSettings ? "pro" : opts.quality;
  return calculateKling30VideoCredits(d, q, true);
}

/** Normalize UI quality strings for motion control billing. */
export function normalizeMotionControlQuality(quality: string | undefined): "720p" | "1080p" {
  const q = (quality ?? "720p").toLowerCase().trim();
  if (q === "1080p" || q === "pro" || q.includes("1080")) return "1080p";
  return "720p";
}

/**
 * Motion control (Kling 3.0 MC): 1080p = anchor rate/s, 720p = 14/27 of anchor.
 * (No separate audio toggle in UI — priced like 1080p vs 720p motion tiers.)
 */
export function calculateMotionControlCreditsFromDuration(
  durationSeconds: number,
  quality: string,
): number {
  const d = Math.max(0, Number(durationSeconds) || 0);
  const tier = normalizeMotionControlQuality(quality);
  const mult = tier === "1080p" ? 1 : 14 / 27;
  return Math.max(1, Math.ceil(d * KLING_3_VIDEO_CREDITS_PER_SECOND * mult));
}
