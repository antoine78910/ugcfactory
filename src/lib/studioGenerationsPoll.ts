import type { SupabaseClient } from "@supabase/supabase-js";
import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";

/**
 * Poll Kie for one processing row and persist success/failure. Does not set credits_refund_hint_sent;
 * use sweepStudioRefundHints after so the client can grant credits once.
 */
export async function pollStudioGenerationRow(
  row: StudioGenerationRow,
  personalApiKey: string | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  if (row.status !== "processing") return;

  const key = row.uses_personal_api ? personalApiKey?.trim() || undefined : undefined;
  if (row.uses_personal_api && !key) return;

  const raw = await kieMarketRecordInfo(row.external_task_id, key);
  const out = kieImageTaskPollOutcome(raw);

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

  const { error } = await supabase
    .from("studio_generations")
    .update({
      status: "failed",
      error_message: out.message,
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
