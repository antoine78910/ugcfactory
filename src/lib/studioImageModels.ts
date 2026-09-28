/** Studio Image tab picker ids sent to `/api/studio/generations/start` and KIE helpers. */

export const STUDIO_UNIFIED_IMAGE_PICKER_IDS = [
  "seedream_45",
  "seedream_50_lite",
  "seedream_50_pro",
  "google_nano_banana",
  "gpt_image_2",
  "gpt_image_2_5_flare",
  "gpt_image_2_5_sunburst",
] as const;

export const STUDIO_LEGACY_IMAGE_PICKER_IDS = [
  "seedream_45_text_to_image",
  "seedream_45_image_to_image",
  "seedream_50_lite_text_to_image",
  "seedream_50_lite_image_to_image",
  "seedream_50_pro_text_to_image",
  "seedream_50_pro_image_to_image",
  "nanobanana_standard",
  "google_nano_banana_edit",
  "gpt_image_2_text_to_image",
  "gpt_image_2_image_to_image",
  "gpt_image_2_5_flare_text_to_image",
  "gpt_image_2_5_flare_image_to_image",
  "gpt_image_2_5_sunburst_text_to_image",
  "gpt_image_2_5_sunburst_image_to_image",
] as const;

export const STUDIO_SEEDREAM_IMAGE_PICKER_IDS = [
  "seedream_45",
  "seedream_50_lite",
  "seedream_50_pro",
  "seedream_45_text_to_image",
  "seedream_45_image_to_image",
  "seedream_50_lite_text_to_image",
  "seedream_50_lite_image_to_image",
  "seedream_50_pro_text_to_image",
  "seedream_50_pro_image_to_image",
] as const;

export type StudioUnifiedImagePickerId = (typeof STUDIO_UNIFIED_IMAGE_PICKER_IDS)[number];
export type StudioLegacyImagePickerId = (typeof STUDIO_LEGACY_IMAGE_PICKER_IDS)[number];
export type StudioSeedreamImagePickerId = (typeof STUDIO_SEEDREAM_IMAGE_PICKER_IDS)[number];

export type StudioImageKiePickerModelId = "nano" | "pro" | StudioUnifiedImagePickerId | StudioLegacyImagePickerId;
export type ResolvedStudioImageKiePickerModelId =
  | "nano"
  | "pro"
  | Extract<StudioLegacyImagePickerId, StudioSeedreamImagePickerId | "nanobanana_standard" | "google_nano_banana_edit">
  | "gpt_image_2_text_to_image"
  | "gpt_image_2_image_to_image"
  | "gpt_image_2_5_flare_text_to_image"
  | "gpt_image_2_5_flare_image_to_image"
  | "gpt_image_2_5_sunburst_text_to_image"
  | "gpt_image_2_5_sunburst_image_to_image";

export function isStudioSeedreamImagePickerId(id: string): id is StudioSeedreamImagePickerId {
  return (STUDIO_SEEDREAM_IMAGE_PICKER_IDS as readonly string[]).includes(id);
}

export function isStudioUnifiedSeedreamPickerId(
  id: string,
): id is Extract<StudioUnifiedImagePickerId, "seedream_45" | "seedream_50_lite" | "seedream_50_pro"> {
  return id === "seedream_45" || id === "seedream_50_lite" || id === "seedream_50_pro";
}

export function isStudioGoogleNanoBananaPickerId(
  id: string,
): id is Extract<StudioUnifiedImagePickerId | StudioLegacyImagePickerId, "google_nano_banana" | "nanobanana_standard" | "google_nano_banana_edit"> {
  return id === "google_nano_banana" || id === "nanobanana_standard" || id === "google_nano_banana_edit";
}

export function isStudioGptImage2PickerModelId(id: string): boolean {
  return id === "gpt_image_2" || id === "gpt_image_2_text_to_image" || id === "gpt_image_2_image_to_image";
}

export function isStudioGptImage2ResolvedPickerId(id: string): id is "gpt_image_2_text_to_image" | "gpt_image_2_image_to_image" {
  return id === "gpt_image_2_text_to_image" || id === "gpt_image_2_image_to_image";
}

const GPT_IMAGE_25_PICKER_IDS = [
  "gpt_image_2_5_flare",
  "gpt_image_2_5_sunburst",
  "gpt_image_2_5_flare_text_to_image",
  "gpt_image_2_5_flare_image_to_image",
  "gpt_image_2_5_sunburst_text_to_image",
  "gpt_image_2_5_sunburst_image_to_image",
] as const;

export type StudioGptImage25PickerId = (typeof GPT_IMAGE_25_PICKER_IDS)[number];

export function isStudioGptImage25PickerModelId(id: string): id is StudioGptImage25PickerId {
  return (GPT_IMAGE_25_PICKER_IDS as readonly string[]).includes(id);
}

export function isStudioGptImage25ResolvedPickerId(
  id: string,
): id is
  | "gpt_image_2_5_flare_text_to_image"
  | "gpt_image_2_5_flare_image_to_image"
  | "gpt_image_2_5_sunburst_text_to_image"
  | "gpt_image_2_5_sunburst_image_to_image" {
  return (
    id === "gpt_image_2_5_flare_text_to_image" ||
    id === "gpt_image_2_5_flare_image_to_image" ||
    id === "gpt_image_2_5_sunburst_text_to_image" ||
    id === "gpt_image_2_5_sunburst_image_to_image"
  );
}

/** Quality/resolution row for models that expose 1K / 2K / 4K (or Seedream 5 Pro basic/high). */
export function studioImageModelSupportsResolutionPicker(id: string): boolean {
  return id === "nano" || id === "pro" || isStudioGptImage25PickerModelId(id) || id.includes("seedream_50_pro");
}

export function isStudioImageKiePickerModelId(id: string): id is StudioImageKiePickerModelId {
  return id === "nano" || id === "pro" || (STUDIO_UNIFIED_IMAGE_PICKER_IDS as readonly string[]).includes(id) || (STUDIO_LEGACY_IMAGE_PICKER_IDS as readonly string[]).includes(id);
}

/** KIE Seedream edit / image-to-image APIs require reference image URLs. */
export function studioSeedreamPickerRequiresReferenceImages(id: StudioSeedreamImagePickerId): boolean {
  return (
    id === "seedream_45_image_to_image" ||
    id === "seedream_50_lite_image_to_image" ||
    id === "seedream_50_pro_image_to_image"
  );
}

/** KIE GPT Image 2 image-to-image requires `input_urls`. */
export function studioGptImage2PickerRequiresReferenceImages(id: string): boolean {
  return id === "gpt_image_2_image_to_image";
}

export function studioGptImage25PickerRequiresReferenceImages(id: string): boolean {
  return id === "gpt_image_2_5_flare_image_to_image" || id === "gpt_image_2_5_sunburst_image_to_image";
}

export function resolveStudioImageModelForReferences(
  id: StudioImageKiePickerModelId,
  hasReferenceImages: boolean,
): ResolvedStudioImageKiePickerModelId {
  switch (id) {
    case "seedream_45":
      return hasReferenceImages ? "seedream_45_image_to_image" : "seedream_45_text_to_image";
    case "seedream_50_lite":
      return hasReferenceImages ? "seedream_50_lite_image_to_image" : "seedream_50_lite_text_to_image";
    case "seedream_50_pro":
      return hasReferenceImages ? "seedream_50_pro_image_to_image" : "seedream_50_pro_text_to_image";
    case "gpt_image_2":
      return hasReferenceImages ? "gpt_image_2_image_to_image" : "gpt_image_2_text_to_image";
    case "gpt_image_2_text_to_image":
    case "gpt_image_2_image_to_image":
      return hasReferenceImages ? "gpt_image_2_image_to_image" : "gpt_image_2_text_to_image";
    case "gpt_image_2_5_flare":
    case "gpt_image_2_5_flare_text_to_image":
    case "gpt_image_2_5_flare_image_to_image":
      return hasReferenceImages ? "gpt_image_2_5_flare_image_to_image" : "gpt_image_2_5_flare_text_to_image";
    case "gpt_image_2_5_sunburst":
    case "gpt_image_2_5_sunburst_text_to_image":
    case "gpt_image_2_5_sunburst_image_to_image":
      return hasReferenceImages
        ? "gpt_image_2_5_sunburst_image_to_image"
        : "gpt_image_2_5_sunburst_text_to_image";
    case "google_nano_banana":
    case "nanobanana_standard":
    case "google_nano_banana_edit":
      return "nano";
    default:
      return id;
  }
}
