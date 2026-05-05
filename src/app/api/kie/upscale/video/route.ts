export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import { KIE_TOPAZ_VIDEO_UPSCALE_MODEL, topazVideoUpscaleCredits } from "@/lib/pricing";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { shouldChargePlatformCredits, assertSufficientCreditsResponse } from "@/lib/credits/metering";

type Body = {
  videoUrl: string;
  /** Kie expects string: "1" | "2" | "4" */
  upscaleFactor?: string;
  personalApiKey?: string;
  /** Detected source video duration in seconds (used for pre-flight credit gate). */
  videoDurationSeconds?: number;
};

/** Fallback duration when the client omits `videoDurationSeconds`. */
const VIDEO_UPSCALE_FALLBACK_SECONDS = 12;

function isRetryableUpscaleCreateError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /http\s*5\d\d/.test(m) ||
    /\bcode\s*5\d\d\b/.test(m) ||
    /internal error|server exception|temporar|timeout|gateway|bad gateway|overload|busy|rate limit|try again|network/.test(
      m,
    )
  );
}

async function createTopazVideoUpscaleTaskWithRetry(params: {
  videoUrl: string;
  upscaleFactor: string;
  callBackUrl: string;
  personalKey?: string;
}): Promise<string> {
  // 4x jobs are significantly heavier and KIE can return transient 5xx/code 500 before accepting.
  // Keep normal behavior for 1x/2x, but grant an extra retry window for 4x.
  const delaysMs = params.upscaleFactor === "4" ? [0, 1500, 3500, 7000] : [0];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    const delay = delaysMs[attempt] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await kieMarketCreateTask(
        {
          model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
          callBackUrl: params.callBackUrl,
          input: {
            video_url: params.videoUrl,
            upscale_factor: params.upscaleFactor,
          },
        },
        params.personalKey,
      );
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err ?? "");
      const canRetry = isRetryableUpscaleCreateError(message);
      if (!canRetry || attempt >= delaysMs.length - 1) break;
    }
  }
  throw (lastErr instanceof Error ? lastErr : new Error("Upscale request failed"));
}

export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;

  const videoUrl = (body.videoUrl ?? "").trim();
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    return NextResponse.json({ error: "Missing or invalid `videoUrl` (HTTPS)." }, { status: 400 });
  }

  const f = (body.upscaleFactor ?? "2").trim();
  if (!["1", "2", "4"].includes(f)) {
    return NextResponse.json({ error: "`upscaleFactor` must be 1, 2, or 4." }, { status: 400 });
  }

  const usesPersonalApi = Boolean(personalKey);
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(user, admin);
  const charges = shouldChargePlatformCredits({ usesPersonalApi, email });
  if (charges && admin) {
    const durationSec =
      Number(body.videoDurationSeconds) > 0
        ? Number(body.videoDurationSeconds)
        : VIDEO_UPSCALE_FALLBACK_SECONDS;
    const costDisplayCredits = topazVideoUpscaleCredits(durationSec, f);
    const dbPlan = await getUserPlan(user.id);
    const gate = await assertSufficientCreditsResponse({
      admin,
      userId: user.id,
      planId: dbPlan ?? "free",
      costDisplayCredits,
    });
    if (gate) return gate;
  }

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

  try {
    const taskId = await createTopazVideoUpscaleTaskWithRetry({
      videoUrl,
      upscaleFactor: f,
      callBackUrl,
      personalKey,
    });

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
    });
  } catch (err) {
    logGenerationFailure("kie/upscale/video", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
