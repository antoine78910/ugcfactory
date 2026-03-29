import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

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
  external_task_id: string;
  provider: string;
  result_urls: string[] | null;
  error_message: string | null;
  credits_charged: number;
  uses_personal_api: boolean;
  credits_refund_hint_sent?: boolean;
};

function rowKindToMediaKind(kind: string, resultUrls: string[], label: string): StudioHistoryItem["kind"] {
  if (kind === "motion_control") return "motion";
  if (kind === "studio_video" || kind === "studio_watermark" || kind === "link_to_ad_video") return "video";
  if (kind === "link_to_ad_image") return "image";
  if (kind === "studio_upscale") {
    const u = resultUrls[0] ?? "";
    if (u) return resultUrlLooksLikeVideo(u) ? "video" : "image";
    return label.toLowerCase().includes("image") ? "image" : "video";
  }
  return "image";
}

export function studioGenerationRowToHistoryItem(row: StudioGenerationRow): StudioHistoryItem {
  const createdAt = new Date(row.created_at).getTime();
  const status = String(row.status ?? "").toLowerCase();
  const resultUrls = normalizeResultUrls(row.result_urls as unknown);
  const mediaKind = rowKindToMediaKind(row.kind, resultUrls, row.label ?? "");
  const hasUrls = resultUrls.length > 0;
  const hasError = typeof row.error_message === "string" && row.error_message.trim().length > 0;
  const isReady = ["ready", "success", "succeeded", "completed", "done"].includes(status);
  const isFailed = ["failed", "error", "errored", "cancelled", "canceled"].includes(status);
  // Be defensive: some providers may persist `result_urls` / `error_message` before (or without) normalizing `status`.
  if (hasUrls || isReady) {
    return {
      id: row.id,
      kind: mediaKind,
      status: "ready",
      label: row.label || "Avatar",
      mediaUrl: resultUrls[0],
      createdAt,
      studioGenerationKind: row.kind,
    };
  }
  if (hasError || isFailed) {
    return {
      id: row.id,
      kind: mediaKind,
      status: "failed",
      label: row.label || "Failed",
      errorMessage: userFacingProviderErrorOrDefault(row.error_message, "Generation failed"),
      creditsRefunded: Boolean(row.credits_refund_hint_sent),
      createdAt,
      studioGenerationKind: row.kind,
    };
  }
  return {
    id: row.id,
    kind: mediaKind,
    status: "generating",
    label: row.label || "Generating…",
    createdAt,
    studioGenerationKind: row.kind,
  };
}
