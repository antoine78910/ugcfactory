import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";

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

function rowKindToMediaKind(kind: string): StudioHistoryItem["kind"] {
  if (kind === "motion_control") return "motion";
  if (kind === "studio_video" || kind === "studio_upscale") return "video";
  return "image";
}

export function studioGenerationRowToHistoryItem(row: StudioGenerationRow): StudioHistoryItem {
  const createdAt = new Date(row.created_at).getTime();
  const mediaKind = rowKindToMediaKind(row.kind);
  if (row.status === "ready") {
    return {
      id: row.id,
      kind: mediaKind,
      status: "ready",
      label: row.label || "Avatar",
      mediaUrl: row.result_urls?.[0],
      createdAt,
      studioGenerationKind: row.kind,
    };
  }
  if (row.status === "failed") {
    return {
      id: row.id,
      kind: mediaKind,
      status: "failed",
      label: row.label || "Failed",
      errorMessage: row.error_message ?? "Generation failed",
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
