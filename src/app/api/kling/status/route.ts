export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
  parseKieResultMediaUrls,
} from "@/lib/kieMarket";
import { isPiapiTaskId, piapiGetSeedanceTask, piapiTaskStatusToLegacy } from "@/lib/piapiSeedance";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

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
      const data = await piapiGetSeedanceTask(taskId, piapiKey);
      const mapped = piapiTaskStatusToLegacy(data);
      if (mapped.status === "FAILED" && mapped.error_message) {
        logGenerationFailure("kling/status", mapped.error_message, { taskId, provider: "piapi" });
      }
      return NextResponse.json({
        data: {
          status: mapped.status,
          response: mapped.response,
          error_message: mapped.error_message
            ? userFacingProviderErrorOrDefault(mapped.error_message)
            : mapped.error_message,
          raw: data,
        },
      });
    }

    const data = await kieMarketRecordInfo(taskId, personalKey);
    const urls = parseKieResultMediaUrls(data.resultJson);

    // Normalize to the old shape the UI already understands.
    if (kieRecordStateIsSuccess(data.state)) {
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
      logGenerationFailure("kling/status", rawFail, { taskId, provider: "kie-market" });
      return NextResponse.json({
        data: {
          status: "FAILED",
          response: [],
          error_message: userFacingProviderErrorOrDefault(rawFail),
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

