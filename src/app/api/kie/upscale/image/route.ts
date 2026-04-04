export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import { KIE_TOPAZ_IMAGE_UPSCALE_MODEL } from "@/lib/pricing";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  imageUrl: string;
  /** Kie Topaz image-upscale: "2" | "4" | "8" → 2K / 4K / 8K tiers */
  upscaleFactor?: string;
  personalApiKey?: string;
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

  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;

  const imageUrl = (body.imageUrl ?? "").trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json({ error: "Missing or invalid `imageUrl` (HTTPS)." }, { status: 400 });
  }

  const f = (body.upscaleFactor ?? "2").trim();
  if (!["2", "4", "8"].includes(f)) {
    return NextResponse.json(
      { error: "`upscaleFactor` must be 2, 4, or 8 (Topaz image 2K / 4K / 8K tier)." },
      { status: 400 },
    );
  }

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

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
