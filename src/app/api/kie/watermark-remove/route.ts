export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";

const KIE_WATERMARK_REMOVE_MODEL = "sora-watermark-remover";

/** Per KIE docs: only OpenAI Sora share pages, not arbitrary MP4 URLs. */
function isSoraWatermarkSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname.toLowerCase() === "sora.chatgpt.com";
  } catch {
    return false;
  }
}

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
  if (videoUrl.length > 500) {
    return NextResponse.json(
      { error: "`videoUrl` must be at most 500 characters (KIE limit)." },
      { status: 400 },
    );
  }
  if (!isSoraWatermarkSourceUrl(videoUrl)) {
    return NextResponse.json(
      {
        error:
          "This tool only accepts a Sora 2 share link from OpenAI (URL must start with https://sora.chatgpt.com/…). Uploading an MP4 file does not work — paste the share link from the Sora app instead.",
      },
      { status: 400 },
    );
  }

  const appUrl = getAppUrl();
  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${appUrl}/api/nanobanana/callback`;

  const personalKey =
    typeof body.personalApiKey === "string" && body.personalApiKey.trim().length > 0
      ? body.personalApiKey.trim()
      : undefined;

  try {
    const taskId = await kieMarketCreateTask(
      {
        model: KIE_WATERMARK_REMOVE_MODEL,
        callBackUrl,
        input: { video_url: videoUrl, upload_method: "s3" },
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
