export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";

const KIE_WATERMARK_REMOVE_MODEL = "sora-2/watermark-remove";

type Body = {
  videoUrl: string;
  personalApiKey?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const videoUrl = (body.videoUrl ?? "").trim();
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    return NextResponse.json(
      { error: "Missing or invalid `videoUrl` (HTTPS)." },
      { status: 400 },
    );
  }

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

  const personalKey =
    typeof body.personalApiKey === "string" && body.personalApiKey.trim().length > 0
      ? body.personalApiKey.trim()
      : undefined;

  try {
    const taskId = await kieMarketCreateTask(
      {
        model: KIE_WATERMARK_REMOVE_MODEL,
        callBackUrl,
        input: { video_url: videoUrl },
      },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: KIE_WATERMARK_REMOVE_MODEL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
