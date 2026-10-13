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
  seedream_50_flash: "seedream/5-flash-text-to-image",
  seedream_50_flash_text_to_image: "seedream/5-flash-text-to-image",
  seedream_50_flash_image_to_image: "seedream/5-flash-image-to-image",
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
  const aspect_ratio = seedreamAspectRatioFromStudio(opts.aspectRatio);
  const isFlash = opts.pickerId.includes("seedream_50_flash");
  const base: Record<string, unknown> = isFlash
    ? {
        // Seedream 5.0 Flash: prompt 4–5000 chars, `size` 1K / 1.5K / 2K, explicit output_format.
        prompt: opts.prompt.length < 4 ? opts.prompt.padEnd(4, ".") : opts.prompt.slice(0, 5000),
        aspect_ratio,
        size: opts.resolution === "1K" ? "1K" : "2K",
        output_format: "png",
      }
    : {
        prompt: opts.prompt,
        aspect_ratio,
        quality: seedreamQualityFromStudioResolution(opts.resolution, opts.pickerId),
      };

  if (studioSeedreamPickerRequiresReferenceImages(opts.pickerId)) {
    const urls = opts.imageUrls?.filter((u) => typeof u === "string" && u.trim().length > 0) ?? [];
    return { ...base, image_urls: isFlash ? urls.slice(0, 10) : urls };
  }

  return base;
}
