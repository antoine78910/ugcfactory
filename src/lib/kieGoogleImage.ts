/** Kie Market, Google Nano Banana 2 / Pro (`docs.kie.ai`). */

export const KIE_MODEL_NANO_BANANA_2 = "nano-banana-2";
export const KIE_MODEL_NANO_BANANA_PRO = "nano-banana-pro";
/** Same input schema as Nano Banana 2, max 10 `image_input`. @see https://docs.kie.ai/market/google/nanobanana-2-1 */
export const KIE_MODEL_NANO_BANANA_2_1 = "nano-banana-2-1";
export const KIE_NANO_BANANA_2_1_MAX_REFERENCE_IMAGES = 10;

export type KieGoogleImageResolution = "1K" | "2K" | "4K";

export function buildKieGoogleImageInput(opts: {
  prompt: string;
  aspectRatio: string;
  resolution: KieGoogleImageResolution;
  imageUrls?: string[];
  outputFormat?: "png" | "jpg";
}) {
  const ar = opts.aspectRatio.trim() || "auto";
  return {
    prompt: opts.prompt,
    aspect_ratio: ar === "auto" ? "auto" : ar,
    resolution: opts.resolution,
    output_format: opts.outputFormat ?? "png",
    ...(opts.imageUrls && opts.imageUrls.length > 0 ? { image_input: opts.imageUrls } : {}),
  };
}

export function kieMarketModelForStudioImage(model: "nano" | "pro"): string {
  return model === "pro" ? KIE_MODEL_NANO_BANANA_PRO : KIE_MODEL_NANO_BANANA_2;
}
