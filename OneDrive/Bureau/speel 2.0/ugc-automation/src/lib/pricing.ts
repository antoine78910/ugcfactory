/**
 * Central pricing & credit rules (product spec).
 * Import from API routes and UI for consistent billing + margin analytics.
 */

import {
  isStudioGoogleNanoBananaPickerId,
  isStudioSeedreamImagePickerId,
  isStudioUnifiedSeedreamPickerId,
} from "@/lib/studioImageModels";
import { normalizeUgcScriptVideoDurationSec } from "@/lib/ugcAiScriptBrief";

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

/** Effective $/credit reference from Starter subscription (requested baseline). */
export const STARTER_CREDIT_VALUE_USD = 29.99 / 250;

// ---------------------------------------------------------------------------
// Link to Ad — Seedance normal (preview): video slice only (full URL Generate adds scan + 3× ref images)
// ---------------------------------------------------------------------------

/**
 * Credits for the **image→video** slice (Seedance normal): 15s → 79 · 30s → 144 (see `LINK_TO_AD_SEEDANCE_VIDEO_CREDITS_BY_DURATION_SEC`).
 * First URL “Generate” for 15s/30s normal uses this amount only (bundle — no extra scan/ref line items). Other durations / Fast still add scan + 3× Nano Pro.
 *
 * 30s is two chained 15s API calls; billed as one bundle (144 cr).
 */
export const LINK_TO_AD_SEEDANCE_VIDEO_CREDITS_BY_DURATION_SEC: Record<5 | 10 | 15 | 30, number> = {
  5: 16,
  10: 32,
  15: 79,
  30: 144,
};

/** Fast tier (~PiAPI $0.08/s vs $0.10/s): slightly lower credit burn than normal. */
export const LINK_TO_AD_SEEDANCE_FAST_VIDEO_CREDITS_BY_DURATION_SEC: Record<5 | 10 | 15, number> = {
  5: 13,
  10: 26,
  15: 42,
};

/** Link to Ad image→video: PiAPI `task_type` maps to these ids for `/api/kling/generate`. */
export type LinkToAdSeedanceSpeed = "normal" | "fast";

export function linkToAdSeedanceMarketModel(speed: LinkToAdSeedanceSpeed): string {
  return speed === "fast" ? "bytedance/seedance-2-fast-preview" : "bytedance/seedance-2-preview";
}

/** Link to Ad video: Seedance 2 Preview only (Kling disabled for this flow). */
export const LINK_TO_AD_VIDEO_MODELS = {
  seedance: {
    marketModelNormal: "bytedance/seedance-2-preview" as const,
    marketModelFast: "bytedance/seedance-2-fast-preview" as const,
  },
} as const;

export type LinkToAdVideoModelId = keyof typeof LINK_TO_AD_VIDEO_MODELS;

/** @deprecated Use `linkToAdSeedanceMarketModel("normal")` */
export const LINK_TO_AD_VIDEO_MARKET_MODEL = LINK_TO_AD_VIDEO_MODELS.seedance.marketModelNormal;

export const CLAUDE_AI_CREDITS = 5;

export function linkToAdVideoCredits(
  model: LinkToAdVideoModelId,
  durationSec: number,
  seedanceSpeed: LinkToAdSeedanceSpeed = "normal",
): number {
  void LINK_TO_AD_VIDEO_MODELS[model];
  const table =
    seedanceSpeed === "fast"
      ? LINK_TO_AD_SEEDANCE_FAST_VIDEO_CREDITS_BY_DURATION_SEC
      : LINK_TO_AD_SEEDANCE_VIDEO_CREDITS_BY_DURATION_SEC;
  const d = normalizeUgcScriptVideoDurationSec(durationSec);
  if (d === 5 || d === 10 || d === 15) return table[d];
  if (d === 30 && seedanceSpeed !== "fast") return LINK_TO_AD_SEEDANCE_VIDEO_CREDITS_BY_DURATION_SEC[30];

  const ref15 = table[15];
  return Math.max(1, Math.ceil((d / 15) * ref15));
}

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

/** Derive billed credits from raw API cost (video margin + cost buffer + credit list price). */
export function computeVideoModelFromCostUsd(costUsd: number): {
  cost_usd: number;
  cost_with_buffer: number;
  target_margin: number;
  price_usd: number;
  credits: number;
} {
  const cost_with_buffer = costUsd * PRICING_BASE.cost_buffer;
  const target_margin = PRICING_BASE.target_margins.video;
  const price_usd = cost_with_buffer / (1 - target_margin);
  const credits = Math.max(1, Math.ceil(price_usd / PRICING_BASE.credit_value_usd));
  return { cost_usd: costUsd, cost_with_buffer, target_margin, price_usd, credits };
}

/** Fal public list; negotiated COGS ≈ list × (1 − 0.1875) → $0.0325. */
export const SEEDREAM_45_FAL_LIST_USD = 0.04;
export const SEEDREAM_45_COST_USD = 0.0325;
export const SEEDREAM_50_LITE_FAL_LIST_USD = 0.035;
export const SEEDREAM_50_LITE_COST_USD = 0.0275;

/** Google Nano Banana 2 / Pro on Kie — credits & COGS from provider sheet (Fal list + negotiated COGS). */
function googleImageTier(p: {
  model: string;
  cost_usd: number;
  fal_list_price_usd: number;
}) {
  // Image pricing target: keep ~50–60% margin (default 55%).
  const our_price_usd = p.cost_usd / (1 - PRICING_BASE.target_margins.image);
  const credits = Math.max(1, Math.ceil(our_price_usd / STARTER_CREDIT_VALUE_USD));
  const cost_with_buffer = p.cost_usd * PRICING_BASE.cost_buffer;
  return {
    model: p.model,
    cost_usd: p.cost_usd,
    cost_with_buffer,
    target_margin: PRICING_BASE.target_margins.image,
    price_usd: our_price_usd,
    credits,
    fal_list_price_usd: p.fal_list_price_usd,
  };
}

/** Product-fixed credits (Studio Nano 2 / Pro tiers). */
function fixedImageModelCredits(p: {
  model: string;
  credits: number;
  fal_list_price_usd: number | null;
}) {
  return {
    model: p.model,
    cost_usd: 0,
    cost_with_buffer: 0,
    target_margin: PRICING_BASE.target_margins.image,
    price_usd: p.credits * 0.07,
    credits: p.credits,
    fal_list_price_usd: p.fal_list_price_usd,
  };
}

/** NanoBanana 2 — 1K / 2K / 4K (studio `nano`). */
const GOOGLE_NANO_2_1K = fixedImageModelCredits({
  model: "google_nano_banana_2_1k",
  credits: 1,
  fal_list_price_usd: 0.08,
});
const GOOGLE_NANO_2_2K = fixedImageModelCredits({
  model: "google_nano_banana_2_2k",
  credits: 2,
  fal_list_price_usd: 0.12,
});
const GOOGLE_NANO_2_4K = fixedImageModelCredits({
  model: "google_nano_banana_2_4k",
  credits: 3,
  fal_list_price_usd: 0.16,
});
/** NanoBanana Pro — 1K/2K = 3 cr; 4K = 4 cr (studio `pro`). */
const GOOGLE_NANO_PRO_12K = fixedImageModelCredits({
  model: "google_nano_banana_pro_1k_2k",
  credits: 3,
  fal_list_price_usd: 0.15,
});
const GOOGLE_NANO_PRO_4K = fixedImageModelCredits({
  model: "google_nano_banana_pro_4k",
  credits: 4,
  fal_list_price_usd: 0.3,
});

export const IMAGE_MODEL = {
  google_nano_banana_2_1k: GOOGLE_NANO_2_1K,
  google_nano_banana_2_2k: GOOGLE_NANO_2_2K,
  google_nano_banana_2_4k: GOOGLE_NANO_2_4K,
  google_nano_banana_pro_1k_2k: GOOGLE_NANO_PRO_12K,
  google_nano_banana_pro_4k: GOOGLE_NANO_PRO_4K,
  /** Legacy — “nano normal” (0.5 cr / image; total jobs use integer credits via ceil). */
  nanobanana_standard: fixedImageModelCredits({
    model: "nanobanana_standard",
    credits: 0.5,
    fal_list_price_usd: 0.039,
  }),
  /**
   * Legacy key used by Link to Ad for 3 reference images (Pro tier 1K/2K).
   */
  nanobanana_pro: fixedImageModelCredits({
    model: "nanobanana_pro",
    credits: 3,
    fal_list_price_usd: 0.15,
  }),
  google_nano_banana_edit: fixedImageModelCredits({
    model: "google_nano_banana_edit",
    credits: 0.5,
    fal_list_price_usd: 0.039,
  }),
  seedream_45_text_to_image: fixedImageModelCredits({
    model: "seedream_45_text_to_image",
    credits: 1,
    fal_list_price_usd: SEEDREAM_45_FAL_LIST_USD,
  }),
  seedream_45_image_to_image: fixedImageModelCredits({
    model: "seedream_45_image_to_image",
    credits: 1,
    fal_list_price_usd: SEEDREAM_45_FAL_LIST_USD,
  }),
  seedream_50_lite_text_to_image: fixedImageModelCredits({
    model: "seedream_50_lite_text_to_image",
    credits: 1,
    fal_list_price_usd: SEEDREAM_50_LITE_FAL_LIST_USD,
  }),
  seedream_50_lite_image_to_image: fixedImageModelCredits({
    model: "seedream_50_lite_image_to_image",
    credits: 1,
    fal_list_price_usd: SEEDREAM_50_LITE_FAL_LIST_USD,
  }),
  seedream_45: fixedImageModelCredits({
    model: "seedream_45",
    credits: 1,
    fal_list_price_usd: SEEDREAM_45_FAL_LIST_USD,
  }),
  seedream_50_lite: fixedImageModelCredits({
    model: "seedream_50_lite",
    credits: 1,
    fal_list_price_usd: SEEDREAM_50_LITE_FAL_LIST_USD,
  }),
  google_nano_banana: fixedImageModelCredits({
    model: "google_nano_banana",
    credits: 0.5,
    fal_list_price_usd: 0.039,
  }),
};

/** Kie Market model id — Topaz Video Upscale (1× / 2× / 4×). */
export const KIE_TOPAZ_VIDEO_UPSCALE_MODEL = "topaz/video-upscale" as const;
/** Kie Market model id — Topaz Image Upscale (2K / 4K / 8K). */
export const KIE_TOPAZ_IMAGE_UPSCALE_MODEL = "topaz/image-upscale" as const;

/** Topaz Video Upscaler — negotiated COGS $0.06/s vs Fal list $0.08/s (−25%). */
export const TOPAZ_VIDEO_UPSCALER = {
  kie_model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
  cost_usd_per_second: 0.06,
  fal_list_usd_per_second: 0.08,
  /** Billed credits per second (product tier). Charge = ceil(duration_sec × this); same for 1× / 2× / 4×. */
  credits_per_second: 2,
} as const;

/** Topaz Image Upscaler — fixed per-image pricing tiers (2K / 4K / 8K). */
export const TOPAZ_IMAGE_UPSCALER = {
  kie_model: KIE_TOPAZ_IMAGE_UPSCALE_MODEL,
  tiers: {
    "2K": {
      credits_per_image: 2,
      our_price_usd: 0.05,
      fal_list_usd: null as number | null,
      discount_vs_fal_pct: null as number | null,
      cogs_usd: 0,
    },
    "4K": {
      credits_per_image: 3,
      our_price_usd: 0.0875,
      fal_list_usd: null as number | null,
      discount_vs_fal_pct: null as number | null,
      cogs_usd: 0,
    },
    "8K": {
      credits_per_image: 5,
      our_price_usd: 0.2,
      fal_list_usd: null as number | null,
      discount_vs_fal_pct: null as number | null,
      cogs_usd: 0,
    },
  },
} as const;

export function topazVideoUpscaleCredits(durationSeconds: number, upscaleFactor: string = "2"): number {
  void upscaleFactor;
  const d = Math.max(0, Number(durationSeconds) || 0);
  return Math.max(1, Math.ceil(d * TOPAZ_VIDEO_UPSCALER.credits_per_second));
}

/**
 * Topaz Image Upscale (Kie `topaz/image-upscale`): `upscale_factor` is **2 | 4 | 8**
 * matching **2K / 4K / 8K** output tiers (not 1×/2×/4× like video).
 * Product credits: 2 / 3 / 5 per image (see `TOPAZ_IMAGE_UPSCALER.tiers`).
 */
export function topazImageUpscaleCredits(factor: string): number {
  const f = factor.trim();
  if (f === "8") return TOPAZ_IMAGE_UPSCALER.tiers["8K"].credits_per_image;
  if (f === "4") return TOPAZ_IMAGE_UPSCALER.tiers["4K"].credits_per_image;
  return TOPAZ_IMAGE_UPSCALER.tiers["2K"].credits_per_image;
}

/** Kie image upscale_factor string → tier label for UI / history labels. */
export function topazImageUpscaleKieFactorToTierLabel(factor: string): "2K" | "4K" | "8K" {
  const f = factor.trim();
  if (f === "8") return "8K";
  if (f === "4") return "4K";
  return "2K";
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
    ourRetailUsd: m.price_usd,
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

/** Google Nano Banana (legacy one-price + edit one-price). */
export const STUDIO_IMAGE_GOOGLE_NANO_BASE_ECONOMICS_ROWS: StudioImageEconomicsRow[] = [
  mapImageModelToEconomicsRow(
    "nanobanana_standard",
    "Google nano banana, text-to-image",
    "image",
    "Google",
    "per image",
  ),
  mapImageModelToEconomicsRow(
    "google_nano_banana_edit",
    "Google nano banana edit, image-to-image",
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
  const customerUsd = m.price_usd;
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

/** Seedream 5.0 Lite rows (ByteDance). */
export const STUDIO_IMAGE_SEEDREAM_50_LITE_ECONOMICS_ROWS = [
  {
    key: "seedream_50_lite_image_to_image" as const,
    modelAndModality: "Seedream 5.0 Lite, image-to-image",
    modality: "image",
    provider: "ByteDance",
  },
  {
    key: "seedream_50_lite_text_to_image" as const,
    modelAndModality: "Seedream 5.0 Lite, text-to-image",
    modality: "image",
    provider: "ByteDance",
  },
].map((row) => {
  const m = IMAGE_MODEL[row.key];
  const customerUsd = m.price_usd;
  const fal = m.fal_list_price_usd ?? SEEDREAM_50_LITE_FAL_LIST_USD;
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

/** Topaz Image Upscaler — 2K / 4K / 8K fixed per-image rows. */
export const STUDIO_UPSCALE_TOPAZ_IMAGE_ROWS: StudioUpscaleEconomicsRow[] = [
  {
    modelAndModality: "Topaz Image Upscaler, image-upscale, 8K",
    modality: "image",
    provider: "Topaz",
    creditsPerUnit: TOPAZ_IMAGE_UPSCALER.tiers["8K"].credits_per_image,
    unitLabel: "per image",
    ourRetailUsd: TOPAZ_IMAGE_UPSCALER.tiers["8K"].our_price_usd,
    falListUsd: TOPAZ_IMAGE_UPSCALER.tiers["8K"].fal_list_usd,
    discountVsFalListPct: TOPAZ_IMAGE_UPSCALER.tiers["8K"].discount_vs_fal_pct,
    cogsUsd: TOPAZ_IMAGE_UPSCALER.tiers["8K"].cogs_usd,
  },
  {
    modelAndModality: "Topaz Image Upscaler, image-upscale, 4K",
    modality: "image",
    provider: "Topaz",
    creditsPerUnit: TOPAZ_IMAGE_UPSCALER.tiers["4K"].credits_per_image,
    unitLabel: "per image",
    ourRetailUsd: TOPAZ_IMAGE_UPSCALER.tiers["4K"].our_price_usd,
    falListUsd: TOPAZ_IMAGE_UPSCALER.tiers["4K"].fal_list_usd,
    discountVsFalListPct: TOPAZ_IMAGE_UPSCALER.tiers["4K"].discount_vs_fal_pct,
    cogsUsd: TOPAZ_IMAGE_UPSCALER.tiers["4K"].cogs_usd,
  },
  {
    modelAndModality: "Topaz Image Upscaler, image-upscale, 2K",
    modality: "image",
    provider: "Topaz",
    creditsPerUnit: TOPAZ_IMAGE_UPSCALER.tiers["2K"].credits_per_image,
    unitLabel: "per image",
    ourRetailUsd: TOPAZ_IMAGE_UPSCALER.tiers["2K"].our_price_usd,
    falListUsd: TOPAZ_IMAGE_UPSCALER.tiers["2K"].fal_list_usd,
    discountVsFalListPct: TOPAZ_IMAGE_UPSCALER.tiers["2K"].discount_vs_fal_pct,
    cogsUsd: TOPAZ_IMAGE_UPSCALER.tiers["2K"].cogs_usd,
  },
];

export type ImageModelKey = keyof typeof IMAGE_MODEL;

export function creditsForImageModel(key: ImageModelKey): number {
  return IMAGE_MODEL[key].credits;
}

/** Pro / Standard studio UI — same resolution keys as Kie Google image APIs. */
export type StudioImageOutputResolution = "1K" | "2K" | "4K";

/**
 * Credits per generated image in Studio (Google Nano 2 / Pro tiers, flat per-model rows elsewhere).
 * Seedream 4.5 / 5.0 Lite: flat 1 credit; `resolution` is ignored for billing (KIE still uses a default quality server-side).
 */
export function studioImageCreditsPerOutput(opts: {
  studioModel: string;
  resolution: StudioImageOutputResolution;
}): number {
  if (isStudioSeedreamImagePickerId(opts.studioModel) || isStudioUnifiedSeedreamPickerId(opts.studioModel)) {
    return IMAGE_MODEL[opts.studioModel].credits;
  }
  if (isStudioGoogleNanoBananaPickerId(opts.studioModel)) {
    const k = opts.studioModel as "google_nano_banana" | "nanobanana_standard" | "google_nano_banana_edit";
    return IMAGE_MODEL[k].credits;
  }
  const m = opts.studioModel as "nano" | "pro";
  if (m === "pro") {
    if (opts.resolution === "4K") return IMAGE_MODEL.google_nano_banana_pro_4k.credits;
    return IMAGE_MODEL.google_nano_banana_pro_1k_2k.credits;
  }
  if (opts.resolution === "4K") return IMAGE_MODEL.google_nano_banana_2_4k.credits;
  if (opts.resolution === "2K") return IMAGE_MODEL.google_nano_banana_2_2k.credits;
  return IMAGE_MODEL.google_nano_banana_2_1k.credits;
}

/**
 * Display credits charged for a Studio image job (may be 0.5 steps for Google Nano Banana).
 * Persisted server-side as ledger ticks: `displayCreditsToLedgerTicks(total)`.
 */
export function studioImageCreditsChargedTotal(opts: {
  studioModel: string;
  resolution: StudioImageOutputResolution;
  numImages: number;
}): number {
  const n = Math.max(1, Math.min(10, Math.floor(Number(opts.numImages) || 1)));
  const per = studioImageCreditsPerOutput({
    studioModel: opts.studioModel,
    resolution: opts.resolution,
  });
  const raw = per * n;
  return Math.ceil(raw * 2) / 2;
}

// ---------------------------------------------------------------------------
// Video — Kling 3.0 dynamic (primary)
// ---------------------------------------------------------------------------

/**
 * Kling 3.0 / 2.6 — 720p (`std`) vs 1080p (`pro`).
 */
export function is1080pVideoQuality(quality: string | undefined): boolean {
  return quality === "pro" || quality === "1080p";
}

/**
 * Kling 3.0 — provider Our price ($/s) × 2 → retail $/s → credits/s at $0.07/credit (same as Sora sheet).
 * Sheet: 1080p+audio $0.135/s → 4 cr/s · 1080p $0.09/s → 3 · 720p+audio $0.10/s → 3 · 720p $0.07/s → 2
 */
export function kling30CreditsPerSecondFromSheet(quality: string | undefined, audio: boolean): number {
  const is1080 = is1080pVideoQuality(quality);
  const ourPerSec = is1080
    ? audio
      ? 0.135
      : 0.09
    : audio
      ? 0.1
      : 0.07;
  const retailPerSec = ourPerSec * 2;
  return Math.max(1, Math.round(retailPerSec / 0.07));
}

/**
 * Kling 2.6 — Fal "Our price" **per video** (5s / 10s × audio). Text vs image same $ on sheet.
 * Retail = ×2 → credits = round(retail / 0.07). Quality (720p/1080p) not priced separately on sheet — ignored for billing.
 */
export function calculateKling26VideoCredits(
  durationSec: number,
  _quality: string | undefined,
  audio: boolean,
): number {
  const d = Math.max(0, Number(durationSec) || 0);
  const use10s = d > 5;
  const withAudio = Boolean(audio);
  const ourUsd = use10s
    ? withAudio
      ? 1.1
      : 0.55
    : withAudio
      ? 0.55
      : 0.275;
  const retailUsd = ourUsd * 2;
  return Math.max(1, Math.round(retailUsd / 0.07));
}

/**
 * Kling 3.0 video credits (studio + API): duration × credits/s from Fal sheet.
 */
export function calculateKling30VideoCredits(
  durationSec: number,
  quality: string | undefined,
  audio: boolean,
): number {
  const d = Math.max(0, Number(durationSec) || 0);
  const perSec = kling30CreditsPerSecondFromSheet(quality, audio);
  return Math.max(1, Math.ceil(d * perSec));
}

/**
 * Shorthand: Kling 3.0, 1080p + audio. Example: 12s → 48 credits (4 cr/s sheet).
 */
export function calculateVideoCreditsFromDuration(durationSec: number): number {
  return calculateKling30VideoCredits(durationSec, "pro", true);
}

/** Reference row: Kling 3.0, 12s + audio @ 1080p (sheet $0.135/s → 4 cr/s). */
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

type VideoTierPricing = {
  model: string;
  cost_usd: number;
  cost_with_buffer: number;
  target_margin: number;
  price_usd: number;
  credits: number;
  fal_list_price_usd: number | null;
  /**
   * DISCOUNT vs Fal (%).
   * Negative when `our_price_usd < fal_list_price_usd` (ex: -67%).
   */
  discount_pct_vs_fal: number | null;
};

/**
 * Sora 2 Pro billing: retail USD = provider “Our price” × 2 (min 2×), then
 * credits = round(retail / {@link SORA_2_PRO_BILLING_CREDIT_USD}).
 * Example: $1.65 → $3.30 → 3.30/0.07 ≈ 47 credits.
 *
 * Sheet rows (provider Our price) — i2v/t2v/storyboard share the same $ for a given quality+duration:
 * High 10s $1.65 → 47 · High 15s $3.15 → 90 · Std 10s $0.75 → 21 · Std 15s $1.35 → 39
 */
export const SORA_2_PRO_BILLING_CREDIT_USD = 0.07;
const SORA_2_PRO_RETAIL_MULTIPLIER = 2;

function makeSora2ProTier(opts: {
  model: string;
  /** Provider “Our price” (USD) per gen from Fal sheet. */
  our_price_usd: number;
  fal_list_price_usd: number | null;
}): VideoTierPricing {
  const target_margin = PRICING_BASE.target_margins.video;
  const retail_usd = opts.our_price_usd * SORA_2_PRO_RETAIL_MULTIPLIER;
  const credits = Math.max(1, Math.round(retail_usd / SORA_2_PRO_BILLING_CREDIT_USD));
  const price_usd = retail_usd;
  const cost_with_buffer = price_usd * (1 - target_margin);
  const cost_usd = cost_with_buffer / PRICING_BASE.cost_buffer;
  const discount_pct_vs_fal =
    opts.fal_list_price_usd != null && opts.fal_list_price_usd > 0
      ? ((opts.our_price_usd - opts.fal_list_price_usd) / opts.fal_list_price_usd) * 100
      : null;
  return {
    model: opts.model,
    cost_usd,
    cost_with_buffer,
    target_margin,
    price_usd,
    credits,
    fal_list_price_usd: opts.fal_list_price_usd,
    discount_pct_vs_fal: discount_pct_vs_fal != null ? Math.round(discount_pct_vs_fal * 10) / 10 : null,
  };
}

/**
 * OpenAI Sora 2 Pro tiers (Fal provider “Our price” → 2× retail → credits @ $0.07/credit).
 * Mapping: `klingMode` -> Standard vs High.
 */
export const SORA_2_PRO_HIGH_10S = makeSora2ProTier({
  model: "sora_2_pro_high_10s",
  our_price_usd: 1.65,
  fal_list_price_usd: 5.0,
});
export const SORA_2_PRO_HIGH_15S = makeSora2ProTier({
  model: "sora_2_pro_high_15s",
  our_price_usd: 3.15,
  fal_list_price_usd: 7.5,
});
export const SORA_2_PRO_STANDARD_10S = makeSora2ProTier({
  model: "sora_2_pro_standard_10s",
  our_price_usd: 0.75,
  fal_list_price_usd: 3.0,
});
export const SORA_2_PRO_STANDARD_15S = makeSora2ProTier({
  model: "sora_2_pro_standard_15s",
  our_price_usd: 1.35,
  fal_list_price_usd: 4.5,
});

/**
 * OpenAI Sora 2 (non-Pro): Fal “stable” vs “Standard”, same retail formula as Sora 2 Pro.
 * UI: `klingMode` std = Standard, pro = stable (stable is higher $).
 */
export const SORA_2_STABLE_10S = makeSora2ProTier({
  model: "sora_2_stable_10s",
  our_price_usd: 0.175,
  fal_list_price_usd: 1.0,
});
export const SORA_2_STABLE_15S = makeSora2ProTier({
  model: "sora_2_stable_15s",
  our_price_usd: 0.2,
  fal_list_price_usd: 1.0,
});
export const SORA_2_STANDARD_10S = makeSora2ProTier({
  model: "sora_2_standard_10s",
  our_price_usd: 0.15,
  fal_list_price_usd: 1.0,
});
export const SORA_2_STANDARD_15S = makeSora2ProTier({
  model: "sora_2_standard_15s",
  our_price_usd: 0.175,
  fal_list_price_usd: 1.5,
});

/** @deprecated Use `SORA_2_STANDARD_10S` — kept for `/api/pricing` reference row name */
export const SORA_10S = SORA_2_STANDARD_10S;

/**
 * Sora 2 (non-Pro): std → Standard tier, pro → stable tier (see Fal sheet).
 */
export function calculateSora2BaseCredits(durationSec: number, quality: string | undefined): number {
  const d = Number(durationSec) || 0;
  const isStable = quality === "pro" || quality === "1080p" || quality === "high";
  if (d <= 10) return isStable ? SORA_2_STABLE_10S.credits : SORA_2_STANDARD_10S.credits;
  return isStable ? SORA_2_STABLE_15S.credits : SORA_2_STANDARD_15S.credits;
}

/** @deprecated Use {@link calculateSora2BaseCredits} with quality — defaults to Standard. */
export function calculateSoraCredits(durationSec: number): number {
  return calculateSora2BaseCredits(durationSec, "std");
}

// ---------------------------------------------------------------------------
// Video — Veo 3.1 (fixed per-video tiers)
// ---------------------------------------------------------------------------

/**
 * Google Veo 3.1 (Fal) — **Fast** vs **Quality** are separate products (different Credits/Gen on sheet).
 * We use Fal’s **Credits / Gen** column per tier (not the generic Sora retail÷$0.07 formula).
 * - Fast (e.g. text/image-to-video Fast): 60 cr · $0.30 our price
 * - Quality (e.g. text/image-to-video Quality): 250 cr · $1.25 our price
 */
const _VEO_3_1_FAST_BASE = makeSora2ProTier({
  model: "veo_3_1_fast",
  our_price_usd: 0.3,
  fal_list_price_usd: 1.2,
});
export const VEO_3_1_FAST: VideoTierPricing = {
  ..._VEO_3_1_FAST_BASE,
  credits: 60,
};

const _VEO_3_1_QUALITY_BASE = makeSora2ProTier({
  model: "veo_3_1_quality",
  our_price_usd: 1.25,
  fal_list_price_usd: 3.2,
});
export const VEO_3_1_QUALITY: VideoTierPricing = {
  ..._VEO_3_1_QUALITY_BASE,
  credits: 250,
};

/** Sora 2 Pro: quality controlled by kling `mode` (std => Standard, pro => High). */
export function calculateSora2ProCredits(durationSec: number, quality: string | undefined): number {
  const d = Number(durationSec) || 0;
  const isHigh = quality === "pro" || quality === "1080p" || quality === "high";
  if (d <= 10) return isHigh ? SORA_2_PRO_HIGH_10S.credits : SORA_2_PRO_STANDARD_10S.credits;
  return isHigh ? SORA_2_PRO_HIGH_15S.credits : SORA_2_PRO_STANDARD_15S.credits;
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
// Marketing — approximate generation counts from a credit balance (UI copy only)
// Nanobanana-class images: 0.5 cr each → count ≈ credits × 2.
// Sora 2–class videos: 5 cr each → count ≈ credits / 5.
// ---------------------------------------------------------------------------

export function upToAiImagesCountFromCredits(credits: number): number {
  const n = Number(credits);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n * 2));
}

export function upToAiVideosCountFromCredits(credits: number): number {
  const n = Number(credits);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n / 5));
}

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
    case "veo3":
      return VEO_3_1_QUALITY.credits;
    case "veo3_fast":
      return VEO_3_1_FAST.credits;
    case "openai/sora-2":
    case "sora-2-image-to-video":
    case "sora-2-text-to-video":
      return calculateSora2BaseCredits(d, quality);
    case "openai/sora-2-pro":
      return calculateSora2ProCredits(d, quality);

    case "kling-3.0/video":
      return calculateKling30VideoCredits(d, quality, audio);
    case "kling-2.6/video":
    case "kling-2.6/image-to-video":
    case "kling-2.6/text-to-video":
      return calculateKling26VideoCredits(d, quality, audio);

    case "bytedance/seedance-2-preview":
      return Math.max(1, calculateKling30VideoCredits(d, "pro", true));
    case "bytedance/seedance-2-fast-preview":
      return Math.max(1, Math.ceil(calculateKling30VideoCredits(d, "pro", true) * 0.82));

    default:
      // Veo, etc.: anchor tier until per-model tables exist
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

/** Motion control fixed per-second billing. */
export const MOTION_CONTROL_CREDITS_PER_SECOND = {
  "720p": 3,
  "1080p": 4,
} as const;

/** WaveSpeed / HeyGen video translate provider price from public docs. */
export const WAVESPEED_HEYGEN_TRANSLATE_COST_USD_PER_SECOND = 0.0375;
/** Product billing rule: 1 credit per second of uploaded video. */
export const WAVESPEED_HEYGEN_TRANSLATE_CREDITS_PER_SECOND = 1;

/**
 * Motion control (Kling 3.0 MC): fixed credits/s by quality tier.
 * (No separate audio toggle in UI — priced by 720p/1080p only.)
 */
export function calculateMotionControlCreditsFromDuration(
  durationSeconds: number,
  quality: string,
): number {
  const d = Math.max(0, Number(durationSeconds) || 0);
  const tier = normalizeMotionControlQuality(quality);
  const perSecond = MOTION_CONTROL_CREDITS_PER_SECOND[tier];
  return Math.max(1, Math.ceil(d * perSecond));
}

export function calculateWaveSpeedVideoTranslateCredits(durationSeconds: number): number {
  const d = Math.max(0, Number(durationSeconds) || 0);
  return Math.max(1, Math.ceil(d * WAVESPEED_HEYGEN_TRANSLATE_CREDITS_PER_SECOND));
}

/**
 * ElevenLabs speech-to-speech (Ad Clone → Voice change): flat credits per job.
 * Same charge regardless of source audio/video duration.
 */
export const VOICE_CHANGE_CREDITS_FLAT = 5;
