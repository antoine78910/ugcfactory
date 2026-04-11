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
      if (mapped.status === "FAILED" && mapped.error_message) {
        logGenerationFailure("kling/status", mapped.error_message, { taskId, provider: "piapi" });
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

