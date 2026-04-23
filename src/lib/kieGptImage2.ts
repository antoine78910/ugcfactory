/** Kie Market GPT Image 2 (`docs.kie.ai`). */

export const KIE_MODEL_GPT_IMAGE_2_TEXT_TO_IMAGE = "gpt-image-2-text-to-image" as const;
export const KIE_MODEL_GPT_IMAGE_2_IMAGE_TO_IMAGE = "gpt-image-2-image-to-image" as const;

export type KieGptImage2ResolvedPickerId = "gpt_image_2_text_to_image" | "gpt_image_2_image_to_image";

export function kieMarketModelForGptImage2Picker(pickerId: KieGptImage2ResolvedPickerId): string {
  return pickerId === "gpt_image_2_image_to_image"
    ? KIE_MODEL_GPT_IMAGE_2_IMAGE_TO_IMAGE
    : KIE_MODEL_GPT_IMAGE_2_TEXT_TO_IMAGE;
}

export function buildKieGptImage2Input(opts: {
  pickerId: KieGptImage2ResolvedPickerId;
  prompt: string;
  aspectRatio: string;
  imageUrls?: string[];
}) {
  const ar = opts.aspectRatio.trim() || "auto";
  const aspect_ratio = ar === "auto" ? "auto" : ar;
  if (opts.pickerId === "gpt_image_2_image_to_image") {
    const input_urls = (opts.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim().length > 0);
    return {
      prompt: opts.prompt,
      input_urls,
      aspect_ratio,
      nsfw_checker: false,
    };
  }
  return {
    prompt: opts.prompt,
    aspect_ratio,
    nsfw_checker: false,
  };
}
