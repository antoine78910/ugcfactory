/**
 * Studio « Edit Video » — picker ids vs Kie `createTask` models.
 *
 * O1 edit input shape aligns with public Kling O1 docs (AIML / Fal): `prompt`, `video_url`, optional `image_urls`, `keep_audio`.
 * Omni / Grok slugs are not clearly listed in Kie’s public index; override via env if Kie returns “unknown model”.
 *
 * Env overrides (server only): `KIE_OMNI_VIDEO_EDIT_MODEL`, `KIE_O1_VIDEO_EDIT_MODEL`, `KIE_GROK_VIDEO_EDIT_MODEL`.
 */

export type StudioVideoEditPickerId =
  | "studio-edit/kling-omni"
  | "studio-edit/kling-o1"
  | "studio-edit/grok"
  | "studio-edit/motion"
  | "studio-edit/motion-v3";

export type StudioVideoEditRouteKind = "kie_edit" | "motion";

export const STUDIO_VIDEO_EDIT_PICKER_IDS: StudioVideoEditPickerId[] = [
  "studio-edit/kling-omni",
  "studio-edit/kling-o1",
  "studio-edit/grok",
  "studio-edit/motion",
  "studio-edit/motion-v3",
];

const DEFAULT_KIE_BY_PICKER: Record<StudioVideoEditPickerId, string> = {
  "studio-edit/kling-omni": "kling-3.0/omni-video-edit",
  "studio-edit/kling-o1": "klingai/video-o1-video-to-video-edit",
  "studio-edit/grok": "grok-imagine/video-to-video-edit",
  "studio-edit/motion": "kling-3.0/motion-control",
  "studio-edit/motion-v3": "kling-3.0/motion-control",
};

export function studioVideoEditRouteKind(pickerId: string): StudioVideoEditRouteKind {
  return pickerId === "studio-edit/motion" || pickerId === "studio-edit/motion-v3" ? "motion" : "kie_edit";
}

export function isStudioVideoEditPickerId(id: string): id is StudioVideoEditPickerId {
  return (STUDIO_VIDEO_EDIT_PICKER_IDS as string[]).includes(id);
}

/** Server: resolve Kie model id (env overrides optional). */
export function resolveKieModelForEditPicker(pickerId: string): string {
  const env =
    pickerId === "studio-edit/kling-omni"
      ? process.env.KIE_OMNI_VIDEO_EDIT_MODEL
      : pickerId === "studio-edit/kling-o1"
        ? process.env.KIE_O1_VIDEO_EDIT_MODEL
        : pickerId === "studio-edit/grok"
          ? process.env.KIE_GROK_VIDEO_EDIT_MODEL
          : undefined;
  const trimmed = env?.trim();
  if (trimmed) return trimmed;
  if (isStudioVideoEditPickerId(pickerId)) return DEFAULT_KIE_BY_PICKER[pickerId];
  return "";
}
