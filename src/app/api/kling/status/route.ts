export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieMarketRecordInfo, parseResultUrls } from "@/lib/kieMarket";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = (searchParams.get("taskId") ?? "").trim();
  const personalKey = (searchParams.get("personalApiKey") ?? "").trim() || undefined;

  if (!taskId) {
    return NextResponse.json({ error: "Missing `taskId`." }, { status: 400 });
  }

  try {
    const data = await kieMarketRecordInfo(taskId, personalKey);
    const urls = parseResultUrls(data.resultJson);

    // Normalize to the old shape the UI already understands.
    if (data.state === "success") {
      return NextResponse.json({
        data: {
          status: "SUCCESS",
          response: urls,
          error_message: null,
          raw: data,
        },
      });
    }
    if (data.state === "fail") {
      return NextResponse.json({
        data: {
          status: "FAILED",
          response: [],
          error_message: data.failMsg ?? "Task failed",
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
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

