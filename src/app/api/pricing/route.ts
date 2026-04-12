import { NextResponse } from "next/server";
import {
  AD_CREDITS,
  AD_GENERATION_COMPOSITION,
  AD_GENERATION_ECONOMICS,
  CREDIT_PACKS,
  IMAGE_MODEL,
  KLING_3_0_12S_AUDIO_REFERENCE,
  calculateKling26VideoCredits,
  kling30CreditsPerSecondFromSheet,
  PRICING_BASE,
  SORA_10S,
  SORA_2_STANDARD_10S,
  SORA_2_STANDARD_15S,
  SORA_2_STABLE_10S,
  SORA_2_STABLE_15S,
  SORA_2_PRO_HIGH_10S,
  SORA_2_PRO_HIGH_15S,
  SORA_2_PRO_STANDARD_10S,
  SORA_2_PRO_STANDARD_15S,
  VEO_3_1_QUALITY,
  SUBSCRIPTIONS,
  TOPAZ_IMAGE_UPSCALER,
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
      topaz_image: TOPAZ_IMAGE_UPSCALER,
    },
    video: {
      kling_26: {
        formula: "per video: round(Fal our_usd * 2 / 0.07); same $ for t2v and i2v",
        credits_by_duration_audio: {
          "5s_with_audio": calculateKling26VideoCredits(5, undefined, true),
          "5s_without_audio": calculateKling26VideoCredits(5, undefined, false),
          "10s_with_audio": calculateKling26VideoCredits(10, undefined, true),
          "10s_without_audio": calculateKling26VideoCredits(10, undefined, false),
        },
      },
      kling_3: {
        formula: "ceil(duration_sec * credits_per_second_tier); tier = round(provider_usd_per_s * 2 / 0.07)",
        credits_per_second: {
          with_audio_1080p: kling30CreditsPerSecondFromSheet("pro", true),
          without_audio_1080p: kling30CreditsPerSecondFromSheet("pro", false),
          with_audio_720p: kling30CreditsPerSecondFromSheet("std", true),
          without_audio_720p: kling30CreditsPerSecondFromSheet("std", false),
        },
      },
      veo_3_1: {
        formula: "per video: quality tier only (see credits on tier object)",
        quality: VEO_3_1_QUALITY,
      },
      example_12s_credits_kling_3_1080p_audio: calculateVideoCreditsFromDuration(12),
      kling_3_0_12s_audio_reference: KLING_3_0_12S_AUDIO_REFERENCE,
      sora_10s: SORA_10S,
      sora_2: {
        standard_10s: SORA_2_STANDARD_10S,
        standard_15s: SORA_2_STANDARD_15S,
        stable_10s: SORA_2_STABLE_10S,
        stable_15s: SORA_2_STABLE_15S,
      },
      sora_2_pro: {
        high_10s: SORA_2_PRO_HIGH_10S,
        high_15s: SORA_2_PRO_HIGH_15S,
        standard_10s: SORA_2_PRO_STANDARD_10S,
        standard_15s: SORA_2_PRO_STANDARD_15S,
      },
    },
    ads: {
      credits_fixed: AD_CREDITS,
      composition: AD_GENERATION_COMPOSITION,
      economics: AD_GENERATION_ECONOMICS,
    },
  });
}
