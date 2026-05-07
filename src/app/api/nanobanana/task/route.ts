export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  extractKieMediaUrls,
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
  type KieMarketRecordInfo,
} from "@/lib/kieMarket";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

function normalizeKieTaskToNanoShape(data: KieMarketRecordInfo) {
  const urls = extractKieMediaUrls(data);
  if (kieRecordStateIsSuccess(data.state)) {
    if (urls.length === 0) {
      return {
        successFlag: -1 as const,
        response: {} as Record<string, unknown>,
        errorMessage: "Task completed but no media URL was returned by provider.",
      };
    }
    return {
      successFlag: 1 as const,
      response: {
        resultUrls: urls,
        resultImageUrl: urls[0],
      },
      errorMessage: null as string | null,
    };
  }
  if (kieRecordStateIsFail(data.state)) {
    return {
      successFlag: -1 as const,
      response: {} as Record<string, unknown>,
      errorMessage: data.failMsg ?? "Task failed",
    };
  }
  return {
    successFlag: 0 as const,
    response: {} as Record<string, unknown>,
    errorMessage: null as string | null,
  };
}

/**
 * Provider transients we never want to fail a poll on. The actual generation usually
 * succeeds on Kie's side; bouncing back HTTP 502 here causes the workflow client to
 * give up on perfectly fine jobs (and leaves `studio_generations` rows stuck in
 * `generating`). Whenever we see one of these patterns we tell the client "still pending"
 * (`successFlag: 0`) so it just polls again after its own backoff.
 *
 * Patterns observed in production:
 *   - "Your call frequency is too high. Please try again later." (Kie / PiAPI throttle)
 *   - 429 / 502 / 503 / 504 from the provider gateway
 *   - generic timeout / network blips / server exception
 */
function isProviderTransientErrorMessage(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    /\bcall frequency\b/.test(m) ||
    /\bfrequency is too high\b/.test(m) ||
    /\btoo many (requests|calls)\b/.test(m) ||
    /\brate ?limit/.test(m) ||
    /\bthrottl/.test(m) ||
    /\b429\b/.test(m) ||
    /\b502\b/.test(m) ||
    /\b503\b/.test(m) ||
    /\b504\b/.test(m) ||
    /try again later/.test(m) ||
    /\btemporar/.test(m) ||
    /timeout|timed out|deadline exceeded|gateway time/.test(m) ||
    /fetch failed|failed to fetch|networkerror|load failed|econnreset|socket|und_err_socket|other side closed/.test(m) ||
    /\b(server exception|internal error|service unavailable|bad gateway|busy|overload)\b/.test(m)
  );
}

const PENDING_BODY = {
  data: {
    successFlag: 0 as const,
    response: {} as Record<string, unknown>,
    errorMessage: null as string | null,
  },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = (searchParams.get("taskId") ?? "").trim();
  const personalKey = (searchParams.get("personalApiKey") ?? "").trim() || undefined;

  if (!taskId) {
    return NextResponse.json({ error: "Missing `taskId`." }, { status: 400 });
  }

  try {
    const raw = await kieMarketRecordInfo(taskId, personalKey);
    if (kieRecordStateIsFail(raw.state) && raw.failMsg) {
      logGenerationFailure("nanobanana/task", raw.failMsg, { taskId });
    }
    const data = normalizeKieTaskToNanoShape(raw);
    const safe =
      data.successFlag === -1 && data.errorMessage
        ? { ...data, errorMessage: userFacingProviderErrorOrDefault(data.errorMessage) }
        : data;
    return NextResponse.json({ data: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    /**
     * Transient provider error — DO NOT fail the poll. The image generation is almost
     * certainly still running successfully on Kie's side. Returning a "pending" body
     * lets the client keep polling (with its own backoff) until the real terminal state
     * arrives. This single change kills the most common cause of "Image batch partial
     * failure" + studio_generations rows stuck in `generating`.
     */
    if (isProviderTransientErrorMessage(message)) {
      // Keep visibility but downgrade severity so log noise is bounded.
      console.warn("[nanobanana/task] transient provider error; reporting pending", {
        taskId,
        message,
      });
      return NextResponse.json(PENDING_BODY, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
    logGenerationFailure("nanobanana/task", err, { taskId });
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
