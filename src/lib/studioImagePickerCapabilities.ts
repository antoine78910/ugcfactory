/**
 * Studio Image tab: picker card hints (aspect / resolution) per model.
 * Aspect ratio UI options stay in `StudioImagePanel` (NANO_BANANA_2_ASPECT_RATIOS, etc.).
 *
 * @see ugc-automation/docs/PROVIDER_MODEL_API_INDEX.md
 */

import type { StudioImageKiePickerModelId } from "@/lib/studioImageModels";

export function studioImagePickerCardHints(id: StudioImageKiePickerModelId): {
  resolution: string;
  durationRange: string;
} {
  switch (id) {
    case "pro":
      return {
        resolution: "1K / 2K / 4K",
        durationRange: "Multi aspect + auto",
      };
    case "nano":
      return {
        resolution: "Model-native",
        durationRange: "Fixed aspect set",
      };
    case "seedream_45":
      return {
        resolution: "Seedream 4.5",
        durationRange: "Text or reference image",
      };
    case "seedream_50_lite":
      return {
        resolution: "Seedream 5 Lite",
        durationRange: "Text or reference image",
      };
    case "google_nano_banana":
      return {
        resolution: "Google pipeline",
        durationRange: "Text or image guided",
      };
    default: {
      const s = id as string;
      if (s.includes("seedream_45")) {
        return {
          resolution: "Seedream 4.5",
          durationRange: "Text or reference image",
        };
      }
      if (s.includes("seedream_50") || s.includes("seedream_5")) {
        return {
          resolution: "Seedream 5 Lite",
          durationRange: "Text or reference image",
        };
      }
      if (s.includes("nanobanana") || s.includes("nano_banana")) {
        return { resolution: "Model-native", durationRange: "Fixed aspect set" };
      }
      return { resolution: "", durationRange: "" };
    }
  }
}
