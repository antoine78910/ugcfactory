export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
  parseKieResultMediaUrls,
} from "@/lib/kieMarket";

function normalizeKieTaskToNanoShape(data: {
  state: string;
  resultJson?: string;
  failMsg?: string;
}) {
  const urls = parseKieResultMediaUrls(data.resultJson);
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
    const data = normalizeKieTaskToNanoShape(raw);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
