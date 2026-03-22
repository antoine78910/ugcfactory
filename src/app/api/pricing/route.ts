import { NextResponse } from "next/server";
import {
  AD_CREDITS,
  AD_GENERATION_COMPOSITION,
  AD_GENERATION_ECONOMICS,
  CREDIT_PACKS,
  IMAGE_MODEL,
  KLING_3_0_12S_AUDIO_REFERENCE,
  KLING_3_VIDEO_CREDITS_PER_SECOND,
  PRICING_BASE,
  SORA_10S,
  SUBSCRIPTIONS,
  TOPAZ_VIDEO_UPSCALER,
  calculateMargin,
  calculateVideoCreditsFromDuration,
} from "@/lib/pricing";

/**
 * Public read-only pricing config for dashboards, webhooks, or internal tools.
 * Adjust auth / caching when you expose sensitive data.
 */
export async function GET() {
  const sampleCredits = 100;
  return NextResponse.json({
    base: PRICING_BASE,
    credit_packs: CREDIT_PACKS,
    subscriptions: SUBSCRIPTIONS,
    images: IMAGE_MODEL,
    upscale: {
      topaz_video: TOPAZ_VIDEO_UPSCALER,
    },
    video: {
      credits_per_second: KLING_3_VIDEO_CREDITS_PER_SECOND,
      formula: "ceil(duration_sec * credits_per_second)",
      example_12s_credits: calculateVideoCreditsFromDuration(12),
      kling_3_0_12s_audio_reference: KLING_3_0_12S_AUDIO_REFERENCE,
      sora_10s: SORA_10S,
    },
    ads: {
      credits_fixed: AD_CREDITS,
      composition: AD_GENERATION_COMPOSITION,
      economics: AD_GENERATION_ECONOMICS,
    },
    margin_helpers: {
      note: "Per spec: cost ≈ credits * 0.0375 USD, revenue ≈ credits * 0.15 USD",
      sample_credits: sampleCredits,
      revenue_usd: sampleCredits * PRICING_BASE.credit_value_usd,
      cost_usd: sampleCredits * PRICING_BASE.real_cost_per_credit_usd,
      margin_ratio: calculateMargin(sampleCredits),
    },
  });
}
