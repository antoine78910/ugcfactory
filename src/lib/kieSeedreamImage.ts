import type { StudioSeedreamImagePickerId } from "@/lib/studioImageModels";
import { studioSeedreamPickerRequiresReferenceImages } from "@/lib/studioImageModels";

const KIE_BY_PICKER: Record<StudioSeedreamImagePickerId, string> = {
  seedream_45: "seedream/4.5-text-to-image",
  seedream_45_text_to_image: "seedream/4.5-text-to-image",
  seedream_45_image_to_image: "seedream/4.5-edit",
  seedream_50_lite: "seedream/5-lite-text-to-image",
  seedream_50_lite_text_to_image: "seedream/5-lite-text-to-image",
  seedream_50_lite_image_to_image: "seedream/5-lite-image-to-image",
  seedream_50_pro: "seedream/5-pro-text-to-image",
  seedream_50_pro_text_to_image: "seedream/5-pro-text-to-image",
  seedream_50_pro_image_to_image: "seedream/5-pro-image-to-image",
};

const SEEDREAM_ASPECTS = new Set([
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "2:3",
  "3:2",
  "21:9",
]);

export function kieMarketModelForSeedreamPicker(pickerId: StudioSeedreamImagePickerId): string {
  return KIE_BY_PICKER[pickerId];
}

/** Maps Studio 1K/2K/4K to KIE `quality`. Seedream 5 Pro: basic = 1K, high = 2K. */
export function seedreamQualityFromStudioResolution(
  resolution: "1K" | "2K" | "4K",
  pickerId?: string,
): "basic" | "high" {
  if (pickerId?.includes("seedream_50_pro")) {
    return resolution === "1K" ? "basic" : "high";
  }
  return resolution === "4K" ? "high" : "basic";
}

export function seedreamAspectRatioFromStudio(aspectRatio: string): string {
  const a = aspectRatio.trim();
  if (a === "auto" || !a) return "1:1";
  return SEEDREAM_ASPECTS.has(a) ? a : "1:1";
}

export function buildKieSeedreamInput(opts: {
  pickerId: StudioSeedreamImagePickerId;
  prompt: string;
  aspectRatio: string;
  resolution: "1K" | "2K" | "4K";
  imageUrls?: string[];
}): Record<string, unknown> {
  const quality = seedreamQualityFromStudioResolution(opts.resolution, opts.pickerId);
  const aspect_ratio = seedreamAspectRatioFromStudio(opts.aspectRatio);
  const base: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio,
    quality,
  };

  if (studioSeedreamPickerRequiresReferenceImages(opts.pickerId)) {
    const urls = opts.imageUrls?.filter((u) => typeof u === "string" && u.trim().length > 0) ?? [];
    return { ...base, image_urls: urls };
  }

  return base;
}
