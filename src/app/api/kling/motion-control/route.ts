export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseMotionControl,
  parseAccountPlan,
  motionControlUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

type BackgroundSource = "input_video" | "input_image";

type Body = {
  accountPlan?: string;
  /** Public HTTPS URL of character image (after upload). */
  imageUrl: string;
  /** Public HTTPS URL of motion reference video (after upload). */
  videoUrl: string;
  /** UI: 720p | 1080p → API std | pro (Kling motion-control docs). */
  quality?: string;
  /** Background from motion clip vs character still (Kie `background_source`). */
  backgroundSource?: BackgroundSource;
  prompt?: string;
  personalApiKey?: string;
};

/** Kie motion-control example uses `720p`; schema text references std/pro — we send resolution strings. */
function motionModeFromQuality(q: string | undefined): string {
  const s = (q ?? "720p").toLowerCase();
  if (s === "1080p" || s === "pro") return "1080p";
  if (s === "std") return "std";
  return "720p";
}

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const imageUrl = (body.imageUrl ?? "").trim();
  const videoUrl = (body.videoUrl ?? "").trim();
  if (!imageUrl || !videoUrl) {
    return NextResponse.json({ error: "Missing `imageUrl` or `videoUrl`." }, { status: 400 });
  }

  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  if (!personalKey) {
    const dbPlan = await getUserPlan(user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    if (!canUseMotionControl(accountPlan)) {
      return NextResponse.json(
        {
          error: motionControlUpgradeMessage(accountPlan) ?? "Subscription upgrade required for Motion Control.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const backgroundSource: BackgroundSource =
    body.backgroundSource === "input_image" ? "input_image" : "input_video";

  const mode = motionModeFromQuality(body.quality);
  const prompt = (body.prompt ?? "").trim();

  try {
    const input: Record<string, unknown> = {
      input_urls: [imageUrl],
      video_urls: [videoUrl],
      mode,
      background_source: backgroundSource,
    };
    if (prompt) input.prompt = prompt.slice(0, 2500);

    const taskId = await kieMarketCreateTask(
      { model: "kling-3.0/motion-control", input },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: "kling-3.0/motion-control",
    });
  } catch (err) {
    logGenerationFailure("kling/motion-control", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
