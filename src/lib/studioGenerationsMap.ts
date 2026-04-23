import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { KIE_TOPAZ_IMAGE_UPSCALE_MODEL, KIE_TOPAZ_VIDEO_UPSCALE_MODEL } from "@/lib/pricing";
import {
  studioImagePickerDisplayLabel,
  studioVideoDisplayLabel,
  studioVideoEditPickerDisplayLabel,
} from "@/lib/subscriptionModelAccess";

const WORKFLOW_HISTORY_LABEL_PREFIX = "[Workflow]";

function parseWorkflowTaggedLabel(raw: string): { label: string; workflowGenerated: boolean } {
  const t = raw.trim();
  if (!t) return { label: "", workflowGenerated: false };
  if (t.startsWith(WORKFLOW_HISTORY_LABEL_PREFIX)) {
    return {
      label: t.slice(WORKFLOW_HISTORY_LABEL_PREFIX.length).trim() || "Workflow generation",
      workflowGenerated: true,
    };
  }
  return { label: t, workflowGenerated: false };
}

function resultUrlLooksLikeVideo(url: string): boolean {
  const t = url.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("blob:")) return true;
  return (
    t.includes(".mp4") ||
    t.includes(".mov") ||
    t.includes(".webm") ||
    t.includes("video/mp4") ||
    t.includes("video/quicktime") ||
    t.includes("video/webm")
  );
}

function resultUrlLooksLikeAudio(url: string): boolean {
  const t = url.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes(".mp3") ||
    t.includes(".wav") ||
    t.includes(".m4a") ||
    t.includes(".ogg") ||
    t.includes(".opus") ||
    t.includes(".aac") ||
    t.includes("audio/")
  );
}

/** Normalize `result_urls` from PostgREST (array, JSON string, or single URL string). */
export function normalizeResultUrls(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) {
        return p.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
      if (typeof p === "string" && p.trim()) return [p.trim()];
    } catch {
      /* single URL or non-JSON */
    }
    if (/^https?:\/\//i.test(t) || t.startsWith("//")) {
      return [t.startsWith("//") ? `https:${t}` : t];
    }
  }
  return [];
}

export type StudioGenerationRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
  kind: string;
  status: string;
  label: string;
  /** Picker / backend model id (e.g. `pro`, `kling-3.0/video`, Topaz model id). */
  model?: string;
  /** KIE / PiAPI / WaveSpeed task id (history + client repair). */
  external_task_id: string;
  provider: string;
  result_urls: string[] | null;
  input_urls: string[] | null;
  error_message: string | null;
  credits_charged: number;
  uses_personal_api: boolean;
  credits_refund_hint_sent?: boolean;
  /** Display hint from Studio UI (e.g. 16:9, 9:16). Optional until migration applied. */
  aspect_ratio?: string | null;
};

/**
 * Human-readable model line for history / lightbox (no raw provider ids in UI when avoidable).
 */
export function studioGenerationModelDisplayLabel(
  kind: string,
  rawModel: string | null | undefined,
): string | undefined {
  const m = (rawModel ?? "").trim();
  if (!m) return undefined;
  switch (kind) {
    case "studio_image":
    case "link_to_ad_image":
      return studioImagePickerDisplayLabel(m);
    case "studio_video":
    case "studio_watermark":
    case "link_to_ad_video":
      if (m.startsWith("studio-edit/")) return studioVideoEditPickerDisplayLabel(m);
      if (m === "motion_control") return "Motion control";
      return studioVideoDisplayLabel(m);
    case "studio_upscale":
      if (m === KIE_TOPAZ_IMAGE_UPSCALE_MODEL || m.includes("image-upscale")) return "Topaz image upscale";
      if (m === KIE_TOPAZ_VIDEO_UPSCALE_MODEL || m.includes("video-upscale")) return "Topaz video upscale";
      return "Upscale";
    case "motion_control":
      return "Motion control";
    case "studio_translate_video":
      return "Video translate";
    case "studio_voice_change":
    case "studio_audio":
      return "Voice";
    default:
      return m.length > 56 ? `${m.slice(0, 53)}…` : m;
  }
}

function modelFieldsFromRow(row: StudioGenerationRow): { model?: string; modelLabel?: string } {
  const raw = typeof row.model === "string" ? row.model.trim() : "";
  if (!raw) return {};
  const modelLabel = studioGenerationModelDisplayLabel(row.kind, raw);
  return { model: raw, ...(modelLabel ? { modelLabel } : {}) };
}

function aspectFromRow(row: StudioGenerationRow): { aspectRatio?: string } {
  const ar = typeof row.aspect_ratio === "string" ? row.aspect_ratio.trim() : "";
  return ar ? { aspectRatio: ar } : {};
}

function rowKindToMediaKind(kind: string, resultUrls: string[], label: string): StudioHistoryItem["kind"] {
  if (kind === "motion_control") {
    const u = resultUrls[0] ?? "";
    if (u && resultUrlLooksLikeAudio(u)) return "audio";
    return "motion";
  }
  if (
    kind === "studio_video" ||
    kind === "studio_watermark" ||
    kind === "link_to_ad_video" ||
    kind === "studio_translate_video"
  ) {
    return "video";
  }
  if (kind === "studio_audio") return "audio";
  if (kind === "link_to_ad_image") return "image";
  if (kind === "studio_upscale") {
    const u = resultUrls[0] ?? "";
    if (u) return resultUrlLooksLikeAudio(u) ? "audio" : resultUrlLooksLikeVideo(u) ? "video" : "image";
    return label.toLowerCase().includes("image") ? "image" : "video";
  }
  return "image";
}

export function studioGenerationRowToHistoryItem(row: StudioGenerationRow): StudioHistoryItem {
  const createdAt = new Date(row.created_at).getTime();
  const status = String(row.status ?? "").toLowerCase();
  const resultUrls = normalizeResultUrls(row.result_urls as unknown);
  const inputUrls = normalizeResultUrls(row.input_urls as unknown);
  const mediaKind = rowKindToMediaKind(row.kind, resultUrls, row.label ?? "");
  const hasUrls = resultUrls.length > 0;
  const hasError = typeof row.error_message === "string" && row.error_message.trim().length > 0;
  const isReady = ["ready", "success", "succeeded", "completed", "done"].includes(status);
  const isFailed = ["failed", "error", "errored", "cancelled", "canceled"].includes(status);
  const inputUrlsOrUndef = inputUrls.length > 0 ? inputUrls : undefined;
  const modelExtra = modelFieldsFromRow(row);
  const aspectExtra = aspectFromRow(row);
  const baseIds = { studioGenerationId: row.id };
  const extId = String(row.external_task_id ?? "").trim();
  const taskExtra = extId ? { externalTaskId: extId } : {};
  const parsedLabel = parseWorkflowTaggedLabel(row.label ?? "");
  const label = parsedLabel.label || "Avatar";
  const workflowExtra = parsedLabel.workflowGenerated ? { workflowGenerated: true } : {};
  if (hasUrls || isReady) {
    return {
      id: row.id,
      kind: mediaKind,
      status: "ready",
      label,
      mediaUrl: resultUrls[0],
      createdAt,
      studioGenerationKind: row.kind,
      inputUrls: inputUrlsOrUndef,
      ...workflowExtra,
      ...baseIds,
      ...taskExtra,
      ...modelExtra,
      ...aspectExtra,
    };
  }
  if (hasError || isFailed) {
    return {
      id: row.id,
      kind: mediaKind,
      status: "failed",
      label: label || "Failed",
      errorMessage: userFacingProviderErrorOrDefault(row.error_message, "Generation failed"),
      creditsRefunded: Boolean(row.credits_refund_hint_sent),
      createdAt,
      studioGenerationKind: row.kind,
      inputUrls: inputUrlsOrUndef,
      ...workflowExtra,
      ...baseIds,
      ...taskExtra,
      ...modelExtra,
      ...aspectExtra,
    };
  }
  return {
    id: row.id,
    kind: mediaKind,
    status: "generating",
    label: label || "Generating…",
    createdAt,
    studioGenerationKind: row.kind,
    inputUrls: inputUrlsOrUndef,
    ...workflowExtra,
    ...baseIds,
    ...taskExtra,
    ...modelExtra,
    ...aspectExtra,
  };
}
