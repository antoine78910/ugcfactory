/**
 * KIE Market uses different `model` ids for text-to-video vs image-to-video.
 * Studio sends a single picker id; resolve here from reference image presence.
 *
 * @see ugc-automation/docs/PROVIDER_MODEL_API_INDEX.md
 */
export function resolveKieVideoPickerToMarketModel(pickerModel: string, hasReferenceImage: boolean): string {
  const id = pickerModel.trim();
  switch (id) {
    case "kling-2.6/video":
      return hasReferenceImage ? "kling-2.6/image-to-video" : "kling-2.6/text-to-video";
    case "openai/sora-2":
      return hasReferenceImage ? "sora-2-image-to-video" : "sora-2-text-to-video";
    case "openai/sora-2-pro":
      return hasReferenceImage ? "sora-2-pro-image-to-video" : "sora-2-pro-text-to-video";
    default:
      return id;
  }
}
