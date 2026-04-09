import type { SupabaseClient } from "@supabase/supabase-js";
import { ledgerTicksToDisplayCredits } from "@/lib/creditLedgerTicks";
import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";
import { kieVeoRecordInfo } from "@/lib/kie";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { isPiapiTaskId, piapiGenericTaskStatusToLegacy, piapiGetTask } from "@/lib/piapiSeedance";
import { serverLog } from "@/lib/serverLog";
import {
  getWaveSpeedPrediction,
  submitWaveSpeedHeygenVideoTranslate,
} from "@/lib/wavespeed";
import {
  parseWaveSpeedMotionTranslateChainTaskId,
  WAVESPEED_CHAIN_PROVIDER,
  WAVESPEED_PROVIDER,
} from "@/lib/wavespeedChain";

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
 * WaveSpeed can briefly return 404 / "task not found" right after submission
 * even though the job is still queued/processing in their backend dashboard.
 * Treat that as transient during a grace window instead of failing immediately.
 */
const WAVESPEED_LOOKUP_MISS_GRACE_MS = 10 * 60 * 1000;

function isTransientWaveSpeedLookupMiss(err: unknown, row: StudioGenerationRow): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  const looksLikeLookupMiss =
    /\b404\b/.test(lower) ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("task not found") ||
    lower.includes("prediction not found") ||
    lower.includes("expired");
  if (!looksLikeLookupMiss) return false;

  const createdAtMs = Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
  if (!(createdAtMs > 0)) return true;
  return Date.now() - createdAtMs < WAVESPEED_LOOKUP_MISS_GRACE_MS;
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
  const providerLc = (row.provider ?? "").toLowerCase();
  if (providerLc === WAVESPEED_CHAIN_PROVIDER) {
    const chain = parseWaveSpeedMotionTranslateChainTaskId(row.external_task_id);
    if (!chain) {
      out = { kind: "fail", message: "Invalid queued translation task." };
    } else {
      const raw = await kieMarketRecordInfo(chain.motionTaskId, kieKey);
      const motionOut = kieImageTaskPollOutcome(raw);
      if (motionOut.kind === "processing") return;
      if (motionOut.kind === "fail") {
        out = { kind: "fail", message: motionOut.message ?? "Motion control failed" };
      } else {
        const motionVideoUrl = motionOut.urls?.find((u) => typeof u === "string" && u.trim().length > 0)?.trim();
        if (!motionVideoUrl) {
          out = { kind: "fail", message: "Motion control completed but returned no video." };
        } else {
          try {
            const translateTask = await submitWaveSpeedHeygenVideoTranslate({
              videoUrl: motionVideoUrl,
              outputLanguage: chain.outputLanguage,
            });
            const translationTaskId = String(translateTask.id ?? "").trim();
            const translationStatus = String(translateTask.status ?? "").toLowerCase();
            if (!translationTaskId && translationStatus !== "completed") {
              throw new Error("Translation service did not return a task id.");
            }
            const { error } = await supabase
              .from("studio_generations")
              .update({
                provider: WAVESPEED_PROVIDER,
                external_task_id: translationTaskId || row.external_task_id,
                status:
                  translationStatus === "failed"
                    ? "failed"
                    : translationStatus === "completed"
                      ? "ready"
                      : "processing",
                error_message:
                  translationStatus === "failed"
                    ? userFacingProviderErrorOrDefault(translateTask.error, "Translation failed")
                    : null,
                result_urls:
                  translationStatus === "completed" && (translateTask.outputs?.length ?? 0) > 0
                    ? translateTask.outputs ?? null
                    : null,
              })
              .eq("id", row.id);
            if (error) throw error;
            if (translationStatus === "completed") {
              out = { kind: "success", urls: translateTask.outputs ?? [] };
            } else if (translationStatus === "failed") {
              out = { kind: "fail", message: translateTask.error ?? "Translation failed" };
            } else {
              return;
            }
          } catch (err) {
            out = {
              kind: "fail",
              message: err instanceof Error ? err.message : "Translation failed",
            };
          }
        }
      }
    }
  } else if (providerLc === WAVESPEED_PROVIDER) {
    try {
      const pred = await getWaveSpeedPrediction(row.external_task_id);
      const predStatus = String(pred.status ?? "").toLowerCase();
      if (predStatus === "completed") out = { kind: "success", urls: pred.outputs ?? [] };
      else if (predStatus === "failed") out = { kind: "fail", message: pred.error ?? "Translation failed" };
      else out = { kind: "processing" };
    } catch (err) {
      if (isTransientWaveSpeedLookupMiss(err, row)) {
        serverLog("wavespeed_prediction_lookup_miss_grace", {
          rowId: row.id,
          externalTaskId: row.external_task_id,
          provider: row.provider,
          message: err instanceof Error ? err.message.slice(0, 500) : String(err ?? "").slice(0, 500),
        });
        out = { kind: "processing" };
      } else {
        serverLog("wavespeed_prediction_lookup_fail", {
          rowId: row.id,
          externalTaskId: row.external_task_id,
          provider: row.provider,
          message: err instanceof Error ? err.message.slice(0, 500) : String(err ?? "").slice(0, 500),
        });
        out = {
          kind: "fail",
          message: err instanceof Error ? err.message : "Could not check translation status.",
        };
      }
    }
  } else if (providerLc === "piapi" || isPiapiTaskId(row.external_task_id)) {
    /** Prefer user PiAPI key when present; otherwise platform key (piapiGetTask fallback). */
    const raw = await piapiGetTask(row.external_task_id, piapiApiKey?.trim() || undefined);
    const mapped = piapiGenericTaskStatusToLegacy(raw);
    if (mapped.status === "IN_PROGRESS") out = { kind: "processing" };
    else if (mapped.status === "SUCCESS") out = { kind: "success", urls: mapped.response };
    else out = { kind: "fail", message: mapped.error_message ?? "Video task failed." };
  } else if (providerLc === "kie-veo") {
    /** Veo uses a dedicated endpoint — not the KIE Market jobs API. */
    const veoData = await kieVeoRecordInfo(row.external_task_id, kieKey);
    const flag = veoData.successFlag;
    if (flag === 1) {
      const urls = veoData.response?.resultUrls ?? [];
      out = urls.length > 0
        ? { kind: "success", urls }
        : { kind: "fail", message: "Veo completed but returned no video URL." };
    } else if (flag === 2 || flag === 3) {
      out = { kind: "fail", message: veoData.errorMessage ?? "Veo generation failed." };
    } else {
      out = { kind: "processing" };
    }
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
    // Save provider URLs directly — cron backfill (backfillEphemeralStudioResults) archives
    // them to Supabase Storage asynchronously, keeping this poll path fast and avoiding
    // Vercel serverless timeouts caused by large video downloads.
    const resultUrls = (out.urls ?? []).map((u) => String(u).trim()).filter(Boolean);

    const { error } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: resultUrls.length ? resultUrls : null,
        error_message: null,
      })
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const rawFail = out.message ?? "Generation failed";
  if (providerLc === WAVESPEED_PROVIDER || providerLc === WAVESPEED_CHAIN_PROVIDER) {
    serverLog("wavespeed_generation_fail_persist", {
      rowId: row.id,
      provider: row.provider,
      externalTaskId: row.external_task_id,
      message: rawFail.slice(0, 500),
    });
  }
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
    if (updated) hints.push({ jobId: row.id, credits: ledgerTicksToDisplayCredits(row.credits_charged) });
  }

  return hints;
}
