/** Kie Market GPT Image 2.5 Flare / Sunburst (`docs.kie.ai`). */

export type KieGptImage25ResolvedPickerId =
  | "gpt_image_2_5_flare_text_to_image"
  | "gpt_image_2_5_flare_image_to_image"
  | "gpt_image_2_5_sunburst_text_to_image"
  | "gpt_image_2_5_sunburst_image_to_image";

const KIE_BY_PICKER: Record<KieGptImage25ResolvedPickerId, string> = {
  gpt_image_2_5_flare_text_to_image: "gpt-image-2-5-flare-text-to-image",
  gpt_image_2_5_flare_image_to_image: "gpt-image-2-5-flare-image-to-image",
  gpt_image_2_5_sunburst_text_to_image: "gpt-image-2-5-sunburst-text-to-image",
  gpt_image_2_5_sunburst_image_to_image: "gpt-image-2-5-sunburst-image-to-image",
};

const GPT25_ASPECTS = new Set([
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "21:9",
]);

export function kieMarketModelForGptImage25Picker(pickerId: KieGptImage25ResolvedPickerId): string {
  return KIE_BY_PICKER[pickerId];
}

export function buildKieGptImage25Input(opts: {
  pickerId: KieGptImage25ResolvedPickerId;
  prompt: string;
  aspectRatio: string;
  resolution: "1K" | "2K" | "4K";
  imageUrls?: string[];
}) {
  const ar = opts.aspectRatio.trim() || "auto";
  const aspect_ratio = GPT25_ASPECTS.has(ar) ? ar : "auto";
  const resolution = opts.resolution === "4K" || opts.resolution === "2K" ? opts.resolution : "1K";
  if (
    opts.pickerId === "gpt_image_2_5_flare_image_to_image" ||
    opts.pickerId === "gpt_image_2_5_sunburst_image_to_image"
  ) {
    const input_urls = (opts.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim().length > 0);
    return {
      prompt: opts.prompt,
      input_urls,
      aspect_ratio,
      resolution,
      background: "auto",
    };
  }
  return {
    prompt: opts.prompt,
    aspect_ratio,
    resolution,
    background: "auto",
  };
}
