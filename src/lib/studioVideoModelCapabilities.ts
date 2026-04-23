/**
 * Studio Video tab: duration / aspect / quality flags per picker id.
 * Keep aligned with `validateStudioVideoJobDuration` and `POST /api/kling/generate`.
 *
 * @see ugc-automation/docs/PROVIDER_MODEL_API_INDEX.md
 */

export const STUDIO_VIDEO_PICKER_IDS = [
  "kling-3.0/video",
  "kling-2.5-turbo/video",
  "kling-2.6/video",
  "openai/sora-2",
  "openai/sora-2-pro",
  "bytedance/seedance-2-preview",
  "bytedance/seedance-2-fast-preview",
  "bytedance/seedance-2",
  "bytedance/seedance-2-fast",
  "veo3_lite",
  "veo3_fast",
  "veo3",
] as const;

/** KIE Veo has no `duration` field; clips are a fixed provider length (~8s). */
export const STUDIO_VEO_DURATION_HINT = "~8s (provider default; not adjustable)";

export function studioVideoIsVeoPickerId(pickerId: string): boolean {
  return pickerId === "veo3_lite" || pickerId === "veo3_fast" || pickerId === "veo3";
}

export type StudioVideoPickerId = (typeof STUDIO_VIDEO_PICKER_IDS)[number];

function isKling26Resolved(model: string): boolean {
  return (
    model === "kling-2.6/video" ||
    model === "kling-2.6/image-to-video" ||
    model === "kling-2.6/text-to-video"
  );
}

function isKling25TurboResolved(model: string): boolean {
  return (
    model === "kling-2.5-turbo/video" ||
    model === "kling-2.5-turbo/image-to-video" ||
    model === "kling-2.5-turbo/text-to-video" ||
    model === "kling/v2-5-turbo-image-to-video-pro" ||
    model === "kling/v2-5-turbo-text-to-video-pro"
  );
}

function isSora2Resolved(model: string): boolean {
  return (
    model === "openai/sora-2" ||
    model === "sora-2-image-to-video" ||
    model === "sora-2-text-to-video"
  );
}

function isSora2ProResolved(model: string): boolean {
  return (
    model === "openai/sora-2-pro" ||
    model === "sora-2-pro-image-to-video" ||
    model === "sora-2-pro-text-to-video"
  );
}

/** Allowed duration values (seconds) for the Studio Video picker, matches server validation. */
export function studioVideoDurationSecOptions(pickerId: string): string[] {
  switch (pickerId) {
    case "kling-3.0/video":
      return Array.from({ length: 13 }, (_, i) => String(i + 3));
    case "kling-2.5-turbo/video":
    case "kling-2.6/video":
      return ["5", "10"];
    case "openai/sora-2":
    case "openai/sora-2-pro":
      return ["10", "15"];
    case "bytedance/seedance-2":
    case "bytedance/seedance-2-fast":
      return Array.from({ length: 12 }, (_, i) => String(i + 4));
    case "bytedance/seedance-2-preview":
    case "bytedance/seedance-2-fast-preview":
      return ["5", "10", "15"];
    case "veo3_lite":
    case "veo3_fast":
    case "veo3":
      return [];
    default:
      return ["5", "10"];
  }
}

export function studioVideoDurationRangeLabel(pickerId: string): string {
  if (studioVideoIsVeoPickerId(pickerId)) return STUDIO_VEO_DURATION_HINT;
  const opts = studioVideoDurationSecOptions(pickerId);
  const nums = opts.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (!nums.length) return "";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${lo}s` : `${lo}–${hi}s`;
}

export function studioVideoSupportsQualityPicker(pickerId: string): boolean {
  return (
    pickerId === "kling-3.0/video" ||
    pickerId === "kling-2.5-turbo/video" ||
    pickerId === "kling-2.6/video" ||
    pickerId === "openai/sora-2" ||
    pickerId === "openai/sora-2-pro"
  );
}

export function studioVideoSupportsNativeAudio(pickerId: string): boolean {
  return (
    pickerId === "kling-3.0/video" ||
    pickerId === "kling-2.5-turbo/video" ||
    pickerId === "kling-2.6/video"
  );
}

export function studioVideoSupportsMultiShot(pickerId: string): boolean {
  return pickerId === "kling-3.0/video";
}

export function studioVideoRequiresStartImage(pickerId: string): boolean {
  return (
    pickerId === "bytedance/seedance-2-preview" || pickerId === "bytedance/seedance-2-fast-preview"
  );
}

/**
 * Studio Create tab: Seedance 2 Preview / Fast Preview use a single 1–4 image upload strip
 * (provider image refs) instead of separate start/end frame slots.
 */
export function studioVideoUsesSeedanceCompactReferenceUploads(pickerId: string): boolean {
  return pickerId === "bytedance/seedance-2-preview" || pickerId === "bytedance/seedance-2-fast-preview";
}

/** Studio Create: Seedance 2 / Fast use omni_reference mixed media instead of start/end frames. */
export function studioVideoUsesSeedanceProOmniMediaUploads(pickerId: string): boolean {
  return pickerId === "bytedance/seedance-2" || pickerId === "bytedance/seedance-2-fast";
}

/** Create tab: show aspect ratio when the provider accepts it for the current frame setup. */
export function studioVideoShowsAspectRatioCreate(pickerId: string, hasStartFrame: boolean): boolean {
  if (pickerId === "kling-3.0/video" || pickerId === "kling-2.5-turbo/video" || pickerId === "kling-2.6/video") {
    return !hasStartFrame;
  }
  if (pickerId.startsWith("bytedance/seedance")) return true;
  if (pickerId === "openai/sora-2" || pickerId === "openai/sora-2-pro") return true;
  return false;
}

export function studioVideoIsSeedancePickerId(pickerId: string): boolean {
  return pickerId.startsWith("bytedance/seedance");
}

export function studioVideoIsSeedance2ProPickerId(pickerId: string): boolean {
  return pickerId === "bytedance/seedance-2" || pickerId === "bytedance/seedance-2-fast";
}

/** Create → Video: named Elements (@names + extra image URLs) for Kling 3.0 and Seedance 2 / Fast only (not Preview). */
export function studioVideoSupportsReferenceElements(pickerId: string): boolean {
  return pickerId === "kling-3.0/video" || studioVideoIsSeedance2ProPickerId(pickerId);
}

/**
 * Server-side duration guard for `/api/kling/generate`.
 * `resolvedModel` is after `resolveKieVideoPickerToMarketModel`.
 */
export function validateStudioVideoJobDuration(
  resolvedModel: string,
  duration: number | undefined,
): void {
  if (duration == null) return;
  if (resolvedModel === "kling-3.0/video") {
    if (duration < 3 || duration > 15) {
      throw new Error("Invalid duration for Kling 3.0. Must be between 3 and 15.");
    }
    return;
  }
  if (isKling26Resolved(resolvedModel)) {
    if (duration !== 5 && duration !== 10) {
      throw new Error("Invalid duration for Kling 2.6. Must be 5 or 10.");
    }
    return;
  }
  if (isKling25TurboResolved(resolvedModel)) {
    if (duration !== 5 && duration !== 10) {
      throw new Error("Invalid duration for Kling 2.5 Turbo. Must be 5 or 10.");
    }
    return;
  }
  if (isSora2Resolved(resolvedModel)) {
    if (duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Sora 2. Must be 10 or 15.");
    }
    return;
  }
  if (isSora2ProResolved(resolvedModel)) {
    if (duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Sora 2 Pro. Must be 10 or 15.");
    }
    return;
  }
  if (resolvedModel === "bytedance/seedance-2" || resolvedModel === "bytedance/seedance-2-fast") {
    const d = Number(duration);
    if (!Number.isFinite(d) || d < 4 || d > 15 || Math.round(d) !== d) {
      throw new Error("Invalid duration for Seedance 2. Must be an integer from 4 to 15 seconds.");
    }
    return;
  }
  if (
    resolvedModel === "bytedance/seedance-2-preview" ||
    resolvedModel === "bytedance/seedance-2-fast-preview" ||
    resolvedModel === "bytedance/seedance-2-preview-vip" ||
    resolvedModel === "bytedance/seedance-2-fast-preview-vip"
  ) {
    if (duration !== 5 && duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Seedance 2 Preview. Must be 5, 10, or 15.");
    }
    return;
  }
  if (duration < 3 || duration > 30) {
    throw new Error("Invalid duration. Must be between 3 and 30.");
  }
}
