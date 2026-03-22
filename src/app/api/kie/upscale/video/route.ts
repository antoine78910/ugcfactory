export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { KIE_TOPAZ_VIDEO_UPSCALE_MODEL } from "@/lib/pricing";

type Body = {
  videoUrl: string;
  /** Kie expects string: "1" | "2" | "4" */
  upscaleFactor?: string;
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
    return NextResponse.json({ error: "Missing or invalid `videoUrl` (HTTPS)." }, { status: 400 });
  }

  const f = (body.upscaleFactor ?? "2").trim();
  if (!["1", "2", "4"].includes(f)) {
    return NextResponse.json({ error: "`upscaleFactor` must be 1, 2, or 4." }, { status: 400 });
  }

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

  try {
    const taskId = await kieMarketCreateTask({
      model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
      callBackUrl,
      input: {
        video_url: videoUrl,
        upscale_factor: f,
      },
    });

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
