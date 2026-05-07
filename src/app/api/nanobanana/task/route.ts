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
import { isProviderTransientErrorMessage } from "@/lib/providerTransientError";

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
