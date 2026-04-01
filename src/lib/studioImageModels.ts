/** Studio Image tab picker ids sent to `/api/studio/generations/start` and KIE helpers. */

export const STUDIO_UNIFIED_IMAGE_PICKER_IDS = [
  "seedream_45",
  "seedream_50_lite",
  "google_nano_banana",
  "recraft_remove_background",
] as const;

export const STUDIO_LEGACY_IMAGE_PICKER_IDS = [
  "seedream_45_text_to_image",
  "seedream_45_image_to_image",
  "seedream_50_lite_text_to_image",
  "seedream_50_lite_image_to_image",
  "nanobanana_standard",
  "google_nano_banana_edit",
] as const;

export const STUDIO_SEEDREAM_IMAGE_PICKER_IDS = [
  "seedream_45",
  "seedream_50_lite",
  "seedream_45_text_to_image",
  "seedream_45_image_to_image",
  "seedream_50_lite_text_to_image",
  "seedream_50_lite_image_to_image",
] as const;

export type StudioUnifiedImagePickerId = (typeof STUDIO_UNIFIED_IMAGE_PICKER_IDS)[number];
export type StudioLegacyImagePickerId = (typeof STUDIO_LEGACY_IMAGE_PICKER_IDS)[number];
export type StudioSeedreamImagePickerId = (typeof STUDIO_SEEDREAM_IMAGE_PICKER_IDS)[number];

export type StudioImageKiePickerModelId = "nano" | "pro" | StudioUnifiedImagePickerId | StudioLegacyImagePickerId;
export type ResolvedStudioImageKiePickerModelId =
  | "nano"
  | "pro"
  | "recraft_remove_background"
  | Extract<StudioLegacyImagePickerId, StudioSeedreamImagePickerId | "nanobanana_standard" | "google_nano_banana_edit">;

export function isStudioSeedreamImagePickerId(id: string): id is StudioSeedreamImagePickerId {
  return (STUDIO_SEEDREAM_IMAGE_PICKER_IDS as readonly string[]).includes(id);
}

export function isStudioUnifiedSeedreamPickerId(
  id: string,
): id is Extract<StudioUnifiedImagePickerId, "seedream_45" | "seedream_50_lite"> {
  return id === "seedream_45" || id === "seedream_50_lite";
}

export function isStudioGoogleNanoBananaPickerId(
  id: string,
): id is Extract<StudioUnifiedImagePickerId | StudioLegacyImagePickerId, "google_nano_banana" | "nanobanana_standard" | "google_nano_banana_edit"> {
  return id === "google_nano_banana" || id === "nanobanana_standard" || id === "google_nano_banana_edit";
}

export function isStudioImageKiePickerModelId(id: string): id is StudioImageKiePickerModelId {
  return id === "nano" || id === "pro" || (STUDIO_UNIFIED_IMAGE_PICKER_IDS as readonly string[]).includes(id) || (STUDIO_LEGACY_IMAGE_PICKER_IDS as readonly string[]).includes(id);
}

/** KIE Seedream edit / image-to-image APIs require reference image URLs. */
export function studioSeedreamPickerRequiresReferenceImages(id: StudioSeedreamImagePickerId): boolean {
  return id === "seedream_45_image_to_image" || id === "seedream_50_lite_image_to_image";
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
    case "google_nano_banana":
    case "nanobanana_standard":
    case "google_nano_banana_edit":
      return "nano";
    default:
      return id;
  }
}
