export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { encodePiapiTaskId, piapiCreateSoraRemoveWatermarkTask } from "@/lib/piapiSeedance";

type Body = {
  videoUrl: string;
  piapiApiKey?: string;
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
  if (videoUrl.length > 500) {
    return NextResponse.json(
      { error: "`videoUrl` must be at most 500 characters." },
      { status: 400 },
    );
  }

  const appUrl = getAppUrl();
  const webhookEndpoint =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${appUrl}/api/nanobanana/callback`;

  const piapiKey =
    typeof body.piapiApiKey === "string" && body.piapiApiKey.trim().length > 0
      ? body.piapiApiKey.trim()
      : undefined;

  try {
    const rawTaskId = await piapiCreateSoraRemoveWatermarkTask({
      videoUrl,
      overrideApiKey: piapiKey,
      webhookEndpoint,
    });

    return NextResponse.json({
      taskId: encodePiapiTaskId(rawTaskId),
      provider: "piapi",
      model: "sora2",
      taskType: "remove-watermark",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
