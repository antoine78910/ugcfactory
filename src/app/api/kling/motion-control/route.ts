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
import { normalizeMotionControlQuality } from "@/lib/pricing";

/** Kling 3.0 `background_source`. For Kling 2.6 the UI uses the same labels; API maps to `character_orientation`. */
type BackgroundSource = "input_video" | "input_image";
type CharacterOrientation = "video" | "image";
type MotionFamily = "kling-3.0" | "kling-2.6";

type Body = {
  accountPlan?: string;
  /** Public HTTPS URL of character image (after upload). */
  imageUrl: string;
  /** Public HTTPS URL of motion reference video (after upload). */
  videoUrl: string;
  /** UI: 720p | 1080p | std | pro, KIE expects `720p` / `1080p` (not std/pro). */
  quality?: string;
  /** `kling-3.0` (default) or `kling-2.6`, see docs.kie.ai motion-control vs motion-control-v3. */
  motionFamily?: string;
  /** Background from motion clip vs character still (`background_source` on 3.0 only). */
  backgroundSource?: BackgroundSource;
  /** Character orientation (Kie `character_orientation`). On 3.0, paired with `background_source` when omitted. */
  characterOrientation?: CharacterOrientation;
  prompt?: string;
  personalApiKey?: string;
};

function parseMotionFamily(raw: string | undefined): MotionFamily {
  const t = (raw ?? "kling-3.0").trim().toLowerCase();
  if (t === "kling-2.6" || t === "2.6" || t.includes("kling-2.6")) return "kling-2.6";
  return "kling-3.0";
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
  const family = parseMotionFamily(body.motionFamily);
  const mode = normalizeMotionControlQuality(body.quality);
  const prompt = (body.prompt ?? "").trim();

  try {
    let kieModel: string;
    let input: Record<string, unknown>;

    if (family === "kling-2.6") {
      // Kling 2.6: no `background_source`, map scene choice to `character_orientation` only.
      const character_orientation: CharacterOrientation =
        backgroundSource === "input_image" ? "image" : "video";
      input = {
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        mode,
        character_orientation,
      };
      if (prompt) input.prompt = prompt.slice(0, 2500);
      kieModel = "kling-2.6/motion-control";
    } else {
      const characterOrientation = resolveCharacterOrientation(
        body.characterOrientation === "video" || body.characterOrientation === "image"
          ? body.characterOrientation
          : undefined,
        backgroundSource,
      );
      input = {
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        mode,
        character_orientation: characterOrientation,
        background_source: backgroundSource,
      };
      if (prompt) input.prompt = prompt.slice(0, 2500);
      kieModel = "kling-3.0/motion-control";
    }

    const taskId = await kieMarketCreateTask({ model: kieModel, input }, personalKey);

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: kieModel,
    });
  } catch (err) {
    logGenerationFailure("kling/motion-control", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
