/**
 * Kie Market, Qwen Image 2.1.
 * @see https://docs.kie.ai/market/qwen2-1/text-to-image
 * @see https://docs.kie.ai/market/qwen2-1/image-to-image
 */

export type KieQwenImage21ResolvedPickerId = "qwen_image_2_1_text_to_image" | "qwen_image_2_1_image_to_image";

const KIE_BY_PICKER: Record<KieQwenImage21ResolvedPickerId, string> = {
  qwen_image_2_1_text_to_image: "qwen2-1/text-to-image",
  qwen_image_2_1_image_to_image: "qwen2-1/image-to-image",
};

const QWEN_21_ASPECTS = new Set(["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "9:21"]);

export const QWEN_IMAGE_21_MAX_REFERENCE_IMAGES = 10;
const QWEN_IMAGE_21_PROMPT_MAX_CHARS = 5000;

export function kieMarketModelForQwenImage21Picker(pickerId: KieQwenImage21ResolvedPickerId): string {
  return KIE_BY_PICKER[pickerId];
}

export function buildKieQwenImage21Input(opts: {
  pickerId: KieQwenImage21ResolvedPickerId;
  prompt: string;
  aspectRatio: string;
  resolution: "1K" | "2K" | "4K";
  imageUrls?: string[];
}): Record<string, unknown> {
  const isEdit = opts.pickerId === "qwen_image_2_1_image_to_image";
  const a = opts.aspectRatio.trim();
  const aspect_ratio = QWEN_21_ASPECTS.has(a) ? a : isEdit ? "auto" : "1:1";
  const input: Record<string, unknown> = {
    prompt: opts.prompt.slice(0, QWEN_IMAGE_21_PROMPT_MAX_CHARS),
    aspect_ratio,
    resolution: opts.resolution === "1K" ? "1K" : "2K",
    output_format: "png",
  };
  if (isEdit) {
    const urls = (opts.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim().length > 0);
    input.image_urls = urls.slice(0, QWEN_IMAGE_21_MAX_REFERENCE_IMAGES);
  }
  return input;
}
