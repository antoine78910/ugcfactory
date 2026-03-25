import type { SupabaseClient } from "@supabase/supabase-js";
import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { isPiapiTaskId, piapiGetSeedanceTask, piapiTaskStatusToLegacy } from "@/lib/piapiSeedance";

/** DB rows we still poll until Kie/PiAPI reports terminal state. */
export const STUDIO_GENERATION_IN_PROGRESS_STATUSES = [
  "processing",
  "generating",
  "pending",
  "queued",
] as const;

function isStudioGenerationInProgressStatus(s: string): boolean {
  return (STUDIO_GENERATION_IN_PROGRESS_STATUSES as readonly string[]).includes(s);
}

/**
 * Poll Kie for one processing row and persist success/failure. Does not set credits_refund_hint_sent;
 * use sweepStudioRefundHints after so the client can grant credits once.
 */
export async function pollStudioGenerationRow(
  row: StudioGenerationRow,
  personalApiKey: string | undefined,
  piapiApiKey: string | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  const status = String(row.status ?? "").toLowerCase();
  if (!isStudioGenerationInProgressStatus(status)) return;

  const kieKey = row.uses_personal_api ? personalApiKey?.trim() || undefined : undefined;

  let out: { kind: "processing" | "success" | "fail"; urls?: string[]; message?: string };
  if ((row.provider ?? "").toLowerCase() === "piapi" || isPiapiTaskId(row.external_task_id)) {
    /** Prefer user PiAPI key when present; otherwise platform key (piapiGetSeedanceTask fallback). */
    const raw = await piapiGetSeedanceTask(row.external_task_id, piapiApiKey?.trim() || undefined);
    const mapped = piapiTaskStatusToLegacy(raw);
    if (mapped.status === "IN_PROGRESS") out = { kind: "processing" };
    else if (mapped.status === "SUCCESS") out = { kind: "success", urls: mapped.response };
    else out = { kind: "fail", message: mapped.error_message ?? "PiAPI task failed" };
  } else {
    /**
     * Platform jobs: always use platform KIE key (override undefined).
     * Personal jobs: use browser key when present; if missing, fall back to platform (fixes mis-flagged rows).
     */
    const raw = await kieMarketRecordInfo(row.external_task_id, kieKey);
    out = kieImageTaskPollOutcome(raw);
  }

  if (out.kind === "processing") return;

  if (out.kind === "success") {
    const { error } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: out.urls,
        error_message: null,
      })
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const rawFail = out.message ?? "Generation failed";
  logGenerationFailure("studioGenerationsPoll", rawFail, {
    rowId: row.id,
    kind: row.kind,
    externalTaskId: row.external_task_id,
    provider: row.provider,
  });

  const { error } = await supabase
    .from("studio_generations")
    .update({
      status: "failed",
      error_message: userFacingProviderErrorOrDefault(rawFail, "Generation failed"),
      result_urls: null,
    })
    .eq("id", row.id);
  if (error) throw error;
}

export async function sweepStudioRefundHints(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
): Promise<{ jobId: string; credits: number }[]> {
  const { data, error } = await supabase
    .from("studio_generations")
    .select("id, credits_charged")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "failed")
    .eq("credits_refund_hint_sent", false)
    .gt("credits_charged", 0);

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const hints: { jobId: string; credits: number }[] = [];
  for (const row of rows) {
    const { data: updated, error: upErr } = await supabase
      .from("studio_generations")
      .update({ credits_refund_hint_sent: true })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("credits_refund_hint_sent", false)
      .select("id")
      .maybeSingle();

    if (upErr) throw upErr;
    if (updated) hints.push({ jobId: row.id, credits: row.credits_charged });
  }

  return hints;
}
