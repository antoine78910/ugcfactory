import {
  STUDIO_UNIFIED_IMAGE_PICKER_IDS,
  type StudioUnifiedImagePickerId,
} from "@/lib/studioImageModels";
import { STUDIO_VIDEO_PICKER_IDS } from "@/lib/studioVideoModelCapabilities";

const IMAGE_PICKER_SET = new Set<string>(STUDIO_UNIFIED_IMAGE_PICKER_IDS);
const VIDEO_PICKER_SET = new Set<string>(STUDIO_VIDEO_PICKER_IDS);

export const RECREATE_IMAGE_MODEL_OPTIONS: { id: StudioUnifiedImagePickerId; label: string }[] = [
  { id: "gpt_image_2", label: "GPT Image 2" },
  { id: "google_nano_banana", label: "Google Nano Banana" },
  { id: "seedream_45", label: "Seedream 4.5" },
  { id: "seedream_50_lite", label: "Seedream 5.0 Lite" },
];

export function pickValidRecreateImageModelId(raw: string | undefined): StudioUnifiedImagePickerId {
  const v = (raw ?? "").trim();
  return IMAGE_PICKER_SET.has(v) ? (v as StudioUnifiedImagePickerId) : "gpt_image_2";
}

export function pickValidRecreateVideoModelId(
  raw: string | undefined,
  fallback = "kling-3.0/video",
): string {
  const v = (raw ?? "").trim();
  return VIDEO_PICKER_SET.has(v) ? v : fallback;
}

export function formatRecreateVideoModelLabel(id: string): string {
  if (id === "openai/sora-2-pro") return "sora-2-pro";
  if (id === "openai/sora-2") return "sora-2";
  if (id === "bytedance/seedance-1.5-pro") return "seedance-1.5-pro";
  return id.replace(/^kling-/, "").replace(/\/video$/, "");
}
