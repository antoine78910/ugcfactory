export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieVeoRecordInfo } from "@/lib/kie";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { isProviderTransientErrorMessage } from "@/lib/providerTransientError";

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
    const message = err instanceof Error ? err.message : "Unknown error.";
    /**
     * See `/api/kling/status` — same logic. Transient provider errors must not turn
     * into HTTP 502, otherwise the Veo client polling throws and aborts a generation
     * that is still completing successfully on Kie's side.
     */
    if (isProviderTransientErrorMessage(message)) {
      console.warn("[kie/veo/status] transient provider error; reporting pending", {
        taskId,
        message,
      });
      return NextResponse.json(
        {
          data: {
            successFlag: 0,
            errorMessage: null,
            response: { resultUrls: [] as string[] },
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    logGenerationFailure("kie/veo/status", err, { taskId });
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
