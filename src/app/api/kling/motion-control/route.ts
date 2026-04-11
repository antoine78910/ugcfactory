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
type CharacterOrientation = "video" | "image";

type Body = {
  accountPlan?: string;
  /** Public HTTPS URL of character image (after upload). */
  imageUrl: string;
  /** Public HTTPS URL of motion reference video (after upload). */
  videoUrl: string;
  /** UI: 720p | 1080p | std | pro — KIE OpenAPI uses `std` (720p) and `pro` (1080p). */
  quality?: string;
  /** Background from motion clip vs character still (Kie `background_source`). */
  backgroundSource?: BackgroundSource;
  /** Character orientation (Kie `character_orientation`). Omit to let the server pair with `background_source`. */
  characterOrientation?: CharacterOrientation;
  prompt?: string;
  personalApiKey?: string;
};

/** KIE `mode`: std = 720p, pro = 1080p (see docs.kie.ai motion-control-v3). */
function motionModeFromQuality(q: string | undefined): "std" | "pro" {
  const s = (q ?? "720p").toLowerCase();
  if (s === "1080p" || s === "pro") return "pro";
  return "std";
}

/**
 * KIE default for `character_orientation` is `video` (recommended).
 * When the background comes from the still (`input_image`), use `image` so pose/backdrop stay consistent unless the client overrides.
 */
function resolveCharacterOrientation(
  requested: CharacterOrientation | undefined,
  backgroundSource: BackgroundSource,
): CharacterOrientation {
  if (requested === "video" || requested === "image") return requested;
  return backgroundSource === "input_image" ? "image" : "video";
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
  const characterOrientation = resolveCharacterOrientation(
    body.characterOrientation === "video" || body.characterOrientation === "image"
      ? body.characterOrientation
      : undefined,
    backgroundSource,
  );

  const mode = motionModeFromQuality(body.quality);
  const prompt = (body.prompt ?? "").trim();

  try {
    const input: Record<string, unknown> = {
      input_urls: [imageUrl],
      video_urls: [videoUrl],
      mode,
      character_orientation: characterOrientation,
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
