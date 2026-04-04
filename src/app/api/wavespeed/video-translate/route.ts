export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { serverLog } from "@/lib/serverLog";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { submitWaveSpeedHeygenVideoTranslate } from "@/lib/wavespeed";
import { isWaveSpeedHeygenTranslateLanguage } from "@/lib/wavespeedTranslateLanguages";

type Body = {
  videoUrl?: string;
  outputLanguage?: string;
};

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const videoUrl = String(body.videoUrl ?? "").trim();
  const outputLanguage = String(body.outputLanguage ?? "").trim();

  if (!videoUrl) {
    return NextResponse.json({ error: "Missing `videoUrl`." }, { status: 400 });
  }
  if (!isWaveSpeedHeygenTranslateLanguage(outputLanguage)) {
    return NextResponse.json({ error: "Unsupported target language." }, { status: 400 });
  }

  try {
    serverLog("wavespeed_translate_submit_start", {
      outputLanguage,
      videoHost: (() => {
        try {
          return new URL(videoUrl).host;
        } catch {
          return "invalid-url";
        }
      })(),
    });
    const result = await submitWaveSpeedHeygenVideoTranslate({ videoUrl, outputLanguage });
    const taskId = String(result.id ?? "").trim();
    if (!taskId && String(result.status ?? "").toLowerCase() !== "completed") {
      throw new Error("WaveSpeed did not return a task id.");
    }

    serverLog("wavespeed_translate_submit_ok", {
      taskId: taskId || null,
      status: result.status ?? null,
      outputs: result.outputs?.length ?? 0,
    });

    return NextResponse.json({
      taskId,
      status: result.status,
      outputs: result.outputs ?? [],
      provider: "wavespeed",
      model: "heygen/video-translate",
    });
  } catch (err) {
    logGenerationFailure("wavespeed/video-translate", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    serverLog("wavespeed_translate_submit_fail", {
      outputLanguage,
      message: message.slice(0, 500),
    });
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
