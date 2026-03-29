/** Studio Image tab picker ids sent to `/api/studio/generations/start` and KIE helpers. */

export const STUDIO_SEEDREAM_IMAGE_PICKER_IDS = [
  "seedream_45_text_to_image",
  "seedream_45_image_to_image",
  "seedream_50_lite_text_to_image",
  "seedream_50_lite_image_to_image",
] as const;

export type StudioSeedreamImagePickerId = (typeof STUDIO_SEEDREAM_IMAGE_PICKER_IDS)[number];

export type StudioImageKiePickerModelId = "nano" | "pro" | StudioSeedreamImagePickerId;

export function isStudioSeedreamImagePickerId(id: string): id is StudioSeedreamImagePickerId {
  return (STUDIO_SEEDREAM_IMAGE_PICKER_IDS as readonly string[]).includes(id);
}

export function isStudioImageKiePickerModelId(id: string): id is StudioImageKiePickerModelId {
  return id === "nano" || id === "pro" || isStudioSeedreamImagePickerId(id);
}

/** KIE Seedream edit / image-to-image APIs require reference image URLs. */
export function studioSeedreamPickerRequiresReferenceImages(id: StudioSeedreamImagePickerId): boolean {
  return id === "seedream_45_image_to_image" || id === "seedream_50_lite_image_to_image";
}
