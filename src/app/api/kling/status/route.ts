export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  extractKieMediaUrls,
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
} from "@/lib/kieMarket";
import { isPiapiTaskId, piapiGenericTaskStatusToLegacy, piapiGetTask } from "@/lib/piapiSeedance";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

const RECENT_FAILURE_LOGS = new Map<string, number>();
const LOG_THROTTLE_MS = 20_000;

function logGenerationFailureThrottled(scope: string, message: string, meta: Record<string, unknown>) {
  const key = `${scope}:${String(meta.taskId ?? "")}:${message}`;
  const now = Date.now();
  const last = RECENT_FAILURE_LOGS.get(key) ?? 0;
  if (now - last < LOG_THROTTLE_MS) return;
  RECENT_FAILURE_LOGS.set(key, now);
  logGenerationFailure(scope, message, meta);
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Best-effort queue ETA extraction from PiAPI raw task payload. */
function extractPiapiWaitHints(raw: unknown): { wait_estimate_seconds: number | null; queue_position: number | null } {
  if (!raw || typeof raw !== "object") {
    return { wait_estimate_seconds: null, queue_position: null };
  }
  const r = raw as Record<string, unknown>;
  const waitCandidates: unknown[] = [
    r.eta_seconds,
    r.estimated_wait_seconds,
    r.estimated_remaining_seconds,
    r.wait_seconds,
    r.queue_wait_seconds,
    (r.meta as Record<string, unknown> | undefined)?.eta_seconds,
    (r.meta as Record<string, unknown> | undefined)?.estimated_wait_seconds,
  ];
  const queueCandidates: unknown[] = [
    r.queue_position,
    (r.meta as Record<string, unknown> | undefined)?.queue_position,
  ];
  const wait =
    waitCandidates.map(toFiniteNumber).find((n): n is number => n !== null && n >= 0) ?? null;
  const queue =
    queueCandidates.map(toFiniteNumber).find((n): n is number => n !== null && n >= 0) ?? null;
  return { wait_estimate_seconds: wait, queue_position: queue };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = (searchParams.get("taskId") ?? "").trim();
  const personalKey = (searchParams.get("personalApiKey") ?? "").trim() || undefined;
  const piapiKey = (searchParams.get("piapiApiKey") ?? "").trim() || undefined;

  if (!taskId) {
    return NextResponse.json({ error: "Missing `taskId`." }, { status: 400 });
  }

  try {
    if (isPiapiTaskId(taskId)) {
      const data = await piapiGetTask(taskId, piapiKey);
      const mapped = piapiGenericTaskStatusToLegacy(data);
      const waitHints = extractPiapiWaitHints(data);
      if (mapped.status === "FAILED" && mapped.error_message) {
        logGenerationFailureThrottled("kling/status", mapped.error_message, {
          taskId,
          provider: "piapi",
        });
      }
      const urls = (mapped.response ?? []).map((u) => String(u).trim()).filter(Boolean);
      const statusOut =
        mapped.status === "SUCCESS" && urls.length === 0 ? "IN_PROGRESS" : mapped.status;
      return NextResponse.json({
        data: {
          status: statusOut,
          response: urls,
          error_message: mapped.error_message
            ? userFacingProviderErrorOrDefault(mapped.error_message)
            : mapped.error_message,
          wait_estimate_seconds: waitHints.wait_estimate_seconds,
          queue_position: waitHints.queue_position,
          raw: data,
        },
      });
    }

    const data = await kieMarketRecordInfo(taskId, personalKey);
    const urls = extractKieMediaUrls(data);

    // Normalize to the old shape the UI already understands.
    if (kieRecordStateIsSuccess(data.state)) {
      // Match server poll (`kieImageTaskPollOutcome`): success without a URL yet stays in progress
      // so motion-control / Kling client polling does not throw "No video URL" or stick on empty.
      if (urls.length === 0) {
        // #region agent log
        fetch("http://127.0.0.1:7533/ingest/f9d4b1f9-c49b-46df-876a-08c4cd510df2", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b39d28" },
          body: JSON.stringify({
            sessionId: "b39d28",
            hypothesisId: "H-kling-success-empty-urls",
            location: "kling/status/route.ts:success-no-urls",
            message: "KIE state success but extractKieMediaUrls empty",
            data: {
              model: String(data.model ?? ""),
              state: String(data.state ?? ""),
              resultJsonLen: String(data.resultJson ?? "").length,
              resultJsonHead: String(data.resultJson ?? "").slice(0, 160),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        return NextResponse.json({
          data: {
            status: "IN_PROGRESS",
            response: [],
            error_message: null,
            raw: data,
          },
        });
      }
      return NextResponse.json({
        data: {
          status: "SUCCESS",
          response: urls,
          error_message: null,
          raw: data,
        },
      });
    }
    if (kieRecordStateIsFail(data.state)) {
      const rawFail = data.failMsg ?? "Task failed";
      logGenerationFailureThrottled("kling/status", rawFail, { taskId, provider: "kie-market" });
      return NextResponse.json({
        data: {
          status: "FAILED",
          response: [],
          error_message: userFacingProviderErrorOrDefault(rawFail),
          raw: data,
        },
      });
    }
    // Sora / KIE sometimes return failMsg (e.g. "internal error") while state is still "generating" or unknown.
    const failMsgOnly = (data.failMsg ?? "").trim();
    if (failMsgOnly && urls.length === 0 && !kieRecordStateIsSuccess(data.state)) {
      logGenerationFailureThrottled("kling/status", failMsgOnly, {
        taskId,
        provider: "kie-market",
        state: data.state,
        hint: "failMsg_without_terminal_state",
      });
      return NextResponse.json({
        data: {
          status: "FAILED",
          response: [],
          error_message: userFacingProviderErrorOrDefault(failMsgOnly),
          raw: data,
        },
      });
    }
    return NextResponse.json({
      data: {
        status: "IN_PROGRESS",
        response: [],
        error_message: null,
        raw: data,
      },
    });
  } catch (err) {
    logGenerationFailure("kling/status", err, { taskId });
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}

