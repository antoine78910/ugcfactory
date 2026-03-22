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

/**
 * Derive billed credits from raw API cost (image margin + cost buffer + credit list price).
 */
export function computeImageModelFromCostUsd(costUsd: number): {
  cost_usd: number;
  cost_with_buffer: number;
  target_margin: number;
  price_usd: number;
  credits: number;
} {
  const cost_with_buffer = costUsd * PRICING_BASE.cost_buffer;
  const target_margin = PRICING_BASE.target_margins.image;
  const price_usd = cost_with_buffer / (1 - target_margin);
  const credits = Math.max(1, Math.ceil(price_usd / PRICING_BASE.credit_value_usd));
  return { cost_usd: costUsd, cost_with_buffer, target_margin, price_usd, credits };
}

/** Fal public list; negotiated COGS ≈ list × (1 − 0.1875) → $0.0325. */
export const SEEDREAM_45_FAL_LIST_USD = 0.04;
export const SEEDREAM_45_COST_USD = 0.0325;

const SEEDREAM_45_BASE = computeImageModelFromCostUsd(SEEDREAM_45_COST_USD);

/** Google Nano Banana 2 / Pro on Kie — credits & COGS from provider sheet (Fal list + negotiated COGS). */
function googleImageTier(p: {
  model: string;
  cost_usd: number;
  credits: number;
  fal_list_price_usd: number;
}) {
  const cost_with_buffer = p.cost_usd * PRICING_BASE.cost_buffer;
  return {
    model: p.model,
    cost_usd: p.cost_usd,
    cost_with_buffer,
    target_margin: PRICING_BASE.target_margins.image,
    price_usd: p.credits * PRICING_BASE.credit_value_usd,
    credits: p.credits,
    fal_list_price_usd: p.fal_list_price_usd,
  };
}

const GOOGLE_NANO_2_1K = googleImageTier({
  model: "google_nano_banana_2_1k",
  cost_usd: 0.04,
  credits: 6,
  fal_list_price_usd: 0.08,
});
const GOOGLE_NANO_2_2K = googleImageTier({
  model: "google_nano_banana_2_2k",
  cost_usd: 0.06,
  credits: 12,
  fal_list_price_usd: 0.12,
});
const GOOGLE_NANO_2_4K = googleImageTier({
  model: "google_nano_banana_2_4k",
  cost_usd: 0.09,
  credits: 18,
  fal_list_price_usd: 0.16,
});
const GOOGLE_NANO_PRO_12K = googleImageTier({
  model: "google_nano_banana_pro_1k_2k",
  cost_usd: 0.09,
  credits: 18,
  fal_list_price_usd: 0.15,
});
const GOOGLE_NANO_PRO_4K = googleImageTier({
  model: "google_nano_banana_pro_4k",
  cost_usd: 0.12,
  credits: 24,
  fal_list_price_usd: 0.3,
});

export const IMAGE_MODEL = {
  google_nano_banana_2_1k: GOOGLE_NANO_2_1K,
  google_nano_banana_2_2k: GOOGLE_NANO_2_2K,
  google_nano_banana_2_4k: GOOGLE_NANO_2_4K,
  google_nano_banana_pro_1k_2k: GOOGLE_NANO_PRO_12K,
  google_nano_banana_pro_4k: GOOGLE_NANO_PRO_4K,
  /** Legacy key — same tier as Google Nano Banana 2 @ 1K (studio “NanoBanana 2”). */
  nanobanana_standard: { ...GOOGLE_NANO_2_1K, model: "nanobanana_standard" },
  /** Legacy key — same tier as Google Nano Banana Pro @ 1K/2K (studio “NanoBanana Pro” default). */
  nanobanana_pro: { ...GOOGLE_NANO_PRO_12K, model: "nanobanana_pro" },
  seedream_45_text_to_image: {
    model: "seedream_45_text_to_image",
    cost_usd: SEEDREAM_45_BASE.cost_usd,
    cost_with_buffer: SEEDREAM_45_BASE.cost_with_buffer,
    target_margin: SEEDREAM_45_BASE.target_margin,
    price_usd: SEEDREAM_45_BASE.price_usd,
    credits: SEEDREAM_45_BASE.credits,
    fal_list_price_usd: SEEDREAM_45_FAL_LIST_USD,
  },
  seedream_45_image_to_image: {
    model: "seedream_45_image_to_image",
    cost_usd: SEEDREAM_45_BASE.cost_usd,
    cost_with_buffer: SEEDREAM_45_BASE.cost_with_buffer,
    target_margin: SEEDREAM_45_BASE.target_margin,
    price_usd: SEEDREAM_45_BASE.price_usd,
    credits: SEEDREAM_45_BASE.credits,
    fal_list_price_usd: SEEDREAM_45_FAL_LIST_USD,
  },
} as const;

/** Kie Market model id — Topaz Video Upscale (1× / 2× / 4×). */
export const KIE_TOPAZ_VIDEO_UPSCALE_MODEL = "topaz/video-upscale" as const;

/** Topaz Video Upscaler — negotiated COGS $0.06/s vs Fal list $0.08/s (−25%). */
export const TOPAZ_VIDEO_UPSCALER = {
  kie_model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
  cost_usd_per_second: 0.06,
  fal_list_usd_per_second: 0.08,
  /** Billed credits per second (product tier). */
  credits_per_second: 12,
} as const;

export function topazVideoUpscaleCredits(durationSeconds: number): number {
  const d = Math.max(0, Number(durationSeconds) || 0);
  return Math.max(1, Math.ceil(d * TOPAZ_VIDEO_UPSCALER.credits_per_second));
}

/** Wholesale discount vs Fal list: (cost_usd − fal_list) / fal_list. */
export function wholesaleDiscountVsFalListPct(costUsd: number, falListUsd: number): number {
  if (!(falListUsd > 0)) return 0;
  return ((costUsd - falListUsd) / falListUsd) * 100;
}

export type StudioImageEconomicsRow = {
  key: string;
  modelAndModality: string;
  modality: string;
  provider: string;
  creditsPerGen: number;
  creditsUnit: string;
  ourRetailUsd: number;
  falListUsd: number | null;
  discountVsFalListPct: number | null;
  cogsUsd: number;
};

function mapImageModelToEconomicsRow(
  key: keyof typeof IMAGE_MODEL,
  modelAndModality: string,
  modality: string,
  provider: string,
  creditsUnit: string,
): StudioImageEconomicsRow {
  const m = IMAGE_MODEL[key];
  const fal =
    "fal_list_price_usd" in m && typeof (m as { fal_list_price_usd?: number }).fal_list_price_usd === "number"
      ? (m as { fal_list_price_usd: number }).fal_list_price_usd
      : null;
  const discountPct = fal != null ? wholesaleDiscountVsFalListPct(m.cost_usd, fal) : null;
  return {
    key,
    modelAndModality,
    modality,
    provider,
    creditsPerGen: m.credits,
    creditsUnit,
    ourRetailUsd: m.credits * PRICING_BASE.credit_value_usd,
    falListUsd: fal,
    discountVsFalListPct: discountPct,
    cogsUsd: m.cost_usd,
  };
}

/** Google Nano Banana 2 (Kie) — studio economics rows. */
export const STUDIO_IMAGE_GOOGLE_NANO_2_ECONOMICS_ROWS: StudioImageEconomicsRow[] = [
  mapImageModelToEconomicsRow(
    "google_nano_banana_2_4k",
    "Google nano banana 2, 4K",
    "image",
    "Google",
    "per image",
  ),
  mapImageModelToEconomicsRow(
    "google_nano_banana_2_2k",
    "Google nano banana 2, 2K",
    "image",
    "Google",
    "per image",
  ),
  mapImageModelToEconomicsRow(
    "google_nano_banana_2_1k",
    "Google nano banana 2, 1K",
    "image",
    "Google",
    "per image",
  ),
];

/** Google Nano Banana Pro (Kie). */
export const STUDIO_IMAGE_GOOGLE_NANO_PRO_ECONOMICS_ROWS: StudioImageEconomicsRow[] = [
  mapImageModelToEconomicsRow(
    "google_nano_banana_pro_1k_2k",
    "Google nano banana pro, 1K / 2K",
    "image",
    "Google",
    "per image",
  ),
  mapImageModelToEconomicsRow(
    "google_nano_banana_pro_4k",
    "Google nano banana pro, 4K",
    "image",
    "Google",
    "per image",
  ),
];

/** Rows for Studio Image transparency table (Seedream 4.5). */
export const STUDIO_IMAGE_SEEDREAM_45_ECONOMICS_ROWS = [
  {
    key: "seedream_45_image_to_image" as const,
    modelAndModality: "Seedream 4.5, image-to-image",
    modality: "image",
    provider: "ByteDance",
  },
  {
    key: "seedream_45_text_to_image" as const,
    modelAndModality: "Seedream 4.5, text-to-image",
    modality: "image",
    provider: "ByteDance",
  },
].map((row) => {
  const m = IMAGE_MODEL[row.key];
  const customerUsd = m.credits * PRICING_BASE.credit_value_usd;
  const fal = m.fal_list_price_usd ?? SEEDREAM_45_FAL_LIST_USD;
  const discountPct = wholesaleDiscountVsFalListPct(m.cost_usd, fal);
  return {
    ...row,
    creditsPerGen: m.credits,
    creditsUnit: "per image",
    ourRetailUsd: customerUsd,
    falListUsd: fal,
    discountVsFalListPct: discountPct,
    cogsUsd: m.cost_usd,
  };
});

export type StudioGrokImagineEconomicsRow = {
  modelAndModality: string;
  modality: string;
  provider: string;
  creditsLabel: string;
  ourRetailUsd: number;
  cogsUsd: number;
};

/** Grok Imagine — batch-priced; no Fal list in sheet. */
export const STUDIO_IMAGE_GROK_IMAGINE_ROWS: StudioGrokImagineEconomicsRow[] = [
  {
    modelAndModality: "grok-imagine, image-to-image",
    modality: "image",
    provider: "Grok",
    creditsLabel: "4 credits per 2 images",
    ourRetailUsd: 4 * PRICING_BASE.credit_value_usd,
    cogsUsd: 0.02,
  },
  {
    modelAndModality: "grok-imagine, text-to-image",
    modality: "image",
    provider: "Grok",
    creditsLabel: "4 credits per 6 images",
    ourRetailUsd: 4 * PRICING_BASE.credit_value_usd,
    cogsUsd: 0.02,
  },
];

export type StudioUpscaleEconomicsRow = {
  modelAndModality: string;
  modality: string;
  provider: string;
  creditsPerUnit: number;
  unitLabel: string;
  ourRetailUsd: number;
  falListUsd: number | null;
  discountVsFalListPct: number | null;
  cogsUsd: number;
};

/** Topaz Video Upscaler — same credits/s for 1× / 2× / 4× (Kie). */
export const STUDIO_UPSCALE_TOPAZ_VIDEO_ROWS: StudioUpscaleEconomicsRow[] = [
  {
    modelAndModality: "Topaz Video Upscaler, upscale factor 1× / 2× / 4×",
    modality: "video",
    provider: "Topaz",
    creditsPerUnit: TOPAZ_VIDEO_UPSCALER.credits_per_second,
    unitLabel: "per second",
    ourRetailUsd: TOPAZ_VIDEO_UPSCALER.credits_per_second * PRICING_BASE.credit_value_usd,
    falListUsd: TOPAZ_VIDEO_UPSCALER.fal_list_usd_per_second,
    discountVsFalListPct: wholesaleDiscountVsFalListPct(
      TOPAZ_VIDEO_UPSCALER.cost_usd_per_second,
      TOPAZ_VIDEO_UPSCALER.fal_list_usd_per_second,
    ),
    cogsUsd: TOPAZ_VIDEO_UPSCALER.cost_usd_per_second,
  },
];

export type ImageModelKey = keyof typeof IMAGE_MODEL;

export function creditsForImageModel(key: ImageModelKey): number {
  return IMAGE_MODEL[key].credits;
}

/** Pro / Standard studio UI — same resolution keys as Kie Google image APIs. */
export type StudioImageOutputResolution = "1K" | "2K" | "4K";

/**
 * Credits per generated image in Studio (Kie Google Nano Banana 2 / Pro).
 */
export function studioImageCreditsPerOutput(opts: {
  studioModel: "pro" | "nano";
  resolution: StudioImageOutputResolution;
}): number {
  if (opts.studioModel === "pro") {
    if (opts.resolution === "4K") return IMAGE_MODEL.google_nano_banana_pro_4k.credits;
    return IMAGE_MODEL.google_nano_banana_pro_1k_2k.credits;
  }
  if (opts.resolution === "4K") return IMAGE_MODEL.google_nano_banana_2_4k.credits;
  if (opts.resolution === "2K") return IMAGE_MODEL.google_nano_banana_2_2k.credits;
  return IMAGE_MODEL.google_nano_banana_2_1k.credits;
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
