import type { SupabaseClient } from "@supabase/supabase-js";
import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { isPiapiTaskId, piapiGetSeedanceTask, piapiTaskStatusToLegacy } from "@/lib/piapiSeedance";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  isStudioMediaPublicUrl,
  persistStudioMediaUrls,
} from "@/lib/studioGenerationsMedia";
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
              throw new Error("WaveSpeed did not return a task id.");
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
              message: err instanceof Error ? err.message : "WaveSpeed translation failed",
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
      out = {
        kind: "fail",
        message: err instanceof Error ? err.message : "WaveSpeed prediction lookup failed",
      };
    }
  } else if (providerLc === "piapi" || isPiapiTaskId(row.external_task_id)) {
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
    const rawUrls = out.urls ?? [];
    const admin = createSupabaseServiceClient();

    const allAlreadyOurs =
      rawUrls.length > 0 && rawUrls.every((u) => isStudioMediaPublicUrl(String(u).trim()));
    let resultUrlsToSave: string[] = rawUrls;

    if (rawUrls.length > 0 && !allAlreadyOurs) {
      const trimmed = rawUrls.map((u) => String(u).trim());

      if (!admin) {
        // No service-role key: save original URLs as-is. Cron backfill will archive later.
        resultUrlsToSave = trimmed;
      } else {
        // Always attempt to archive ALL provider URLs to Supabase Storage.
        // persistStudioMediaUrls now keeps the original URL as fallback on failure,
        // so `persisted` always has the same count as `trimmed` — never drops URLs.
        const { urls: persisted } = await persistStudioMediaUrls({
          admin,
          userId: row.user_id,
          rowId: row.id,
          urls: trimmed,
        });
        // Save whatever we got (mix of studio-media URLs + fallback originals).
        // The cron backfill will gradually migrate any remaining fallback URLs.
        resultUrlsToSave = persisted.length ? persisted : trimmed;
      }
    }

    const { error } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: resultUrlsToSave.length ? resultUrlsToSave : null,
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
