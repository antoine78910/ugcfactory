export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { KIE_TOPAZ_IMAGE_UPSCALE_MODEL } from "@/lib/pricing";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";

type Body = {
  imageUrl: string;
  /** Kie: "1" | "2" | "4" | "8" */
  upscaleFactor?: string;
  personalApiKey?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const imageUrl = (body.imageUrl ?? "").trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json({ error: "Missing or invalid `imageUrl` (HTTPS)." }, { status: 400 });
  }

  const f = (body.upscaleFactor ?? "2").trim();
  if (!["1", "2", "4", "8"].includes(f)) {
    return NextResponse.json({ error: "`upscaleFactor` must be 1, 2, 4, or 8." }, { status: 400 });
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
        model: KIE_TOPAZ_IMAGE_UPSCALE_MODEL,
        callBackUrl,
        input: {
          image_url: imageUrl,
          upscale_factor: f,
        },
      },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: KIE_TOPAZ_IMAGE_UPSCALE_MODEL,
    });
  } catch (err) {
    logGenerationFailure("kie/upscale/image", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
