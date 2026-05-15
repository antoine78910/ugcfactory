import { STUDIO_VIDEO_PICKER_IDS, type StudioVideoPickerId } from "@/lib/studioVideoModelCapabilities";

/** Picker ids the recreate analyst may recommend; must stay aligned with Studio Video. */
export const RECREATE_ANALYSIS_VIDEO_MODEL_ALLOWLIST: readonly StudioVideoPickerId[] = STUDIO_VIDEO_PICKER_IDS;

export function sanitizeRecreateRecommendedVideoModels(raw: unknown, max = 4): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(RECREATE_ANALYSIS_VIDEO_MODEL_ALLOWLIST);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!allowed.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Deterministic fallback when the vision model omits or returns invalid picker ids.
 */
export function fallbackVideoModelsForVisualStyle(category: string): string[] {
  const c = category.toLowerCase();
  if (c.includes("clay") || c.includes("stop_motion") || c.includes("stop motion")) {
    return ["kling-3.0/video", "openai/sora-2-pro", "bytedance/seedance-2"];
  }
  if (c.includes("pixar") || c.includes("cgi") || c.includes("hyperreal")) {
    return ["openai/sora-2-pro", "kling-3.0/video", "veo3"];
  }
  if (c.includes("motion_graphics") || c.includes("motion graphics")) {
    return ["kling-3.0/video", "bytedance/seedance-2-fast", "veo3_fast"];
  }
  if (c.includes("authentic_ugc") || c.includes("studio_ugc") || c.includes("meme")) {
    return ["kling-2.6/video", "kling-3.0/video", "bytedance/seedance-2-fast"];
  }
  if (c.includes("cinematic")) {
    return ["kling-3.0/video", "openai/sora-2-pro", "veo3"];
  }
  return ["kling-3.0/video", "kling-2.6/video", "bytedance/seedance-2-fast"];
}
