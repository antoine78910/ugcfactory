export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { getWaveSpeedPrediction } from "@/lib/wavespeed";

function transientWaveSpeedLookupMiss(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  return (
    /\b404\b/.test(lower) ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("task not found") ||
    lower.includes("prediction not found") ||
    lower.includes("expired")
  );
}

/**
 * Client poll for HeyGen video-translate (WaveSpeed). Same contract style as `/api/kling/status`.
 */
export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get("taskId")?.trim() ?? "";
  if (!taskId) {
    return NextResponse.json({ error: "Missing `taskId`." }, { status: 400 });
  }

  try {
    const pred = await getWaveSpeedPrediction(taskId);
    const predStatus = String(pred.status ?? "").toLowerCase();
    const waveDone =
      predStatus === "completed" ||
      predStatus === "complete" ||
      predStatus === "success" ||
      predStatus === "succeeded" ||
      predStatus === "done" ||
      predStatus === "finished";
    const waveUrls = (pred.outputs ?? []).map((u) => String(u).trim()).filter(Boolean);
    const failed = predStatus === "failed";

    return NextResponse.json({
      data: {
        status: pred.status ?? (waveDone ? "completed" : "processing"),
        outputs: waveUrls,
        error: pred.error ?? null,
        done: waveDone && waveUrls.length > 0,
        /** Completed but provider has not attached URLs yet, keep polling. */
        waitingForOutputs: waveDone && waveUrls.length === 0,
        failed,
      },
    });
  } catch (err) {
    if (transientWaveSpeedLookupMiss(err)) {
      return NextResponse.json({
        data: {
          status: "processing",
          outputs: [] as string[],
          error: null,
          done: false,
          waitingForOutputs: false,
          failed: false,
        },
      });
    }
    logGenerationFailure("wavespeed/prediction", err, { taskId });
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
