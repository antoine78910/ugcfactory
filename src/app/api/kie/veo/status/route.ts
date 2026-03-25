export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieVeoRecordInfo } from "@/lib/kie";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = (searchParams.get("taskId") ?? "").trim();
  const personalKey = (searchParams.get("personalApiKey") ?? "").trim() || undefined;

  if (!taskId) {
    return NextResponse.json({ error: "Missing `taskId`." }, { status: 400 });
  }

  try {
    const data = await kieVeoRecordInfo(taskId, personalKey);
    const errRaw = typeof data.errorMessage === "string" ? data.errorMessage : null;
    if (errRaw && data.successFlag != null && data.successFlag !== 0 && data.successFlag !== 1) {
      logGenerationFailure("kie/veo/status", errRaw, { taskId, successFlag: data.successFlag });
    }
    const safe =
      errRaw && data.successFlag !== 1
        ? { ...data, errorMessage: userFacingProviderErrorOrDefault(errRaw) }
        : data;
    return NextResponse.json({ data: safe });
  } catch (err) {
    logGenerationFailure("kie/veo/status", err, { taskId });
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}

