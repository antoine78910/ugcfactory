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
        successFlag: 0 as const,
        response: {} as Record<string, unknown>,
        errorMessage: null as string | null,
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
    logGenerationFailure("nanobanana/task", err, { taskId });
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
