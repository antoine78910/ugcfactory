export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { mirrorImageUrlForPiapiSeedance } from "@/lib/mirrorImageUrlForPiapi";
import { encodePiapiTaskId, piapiCreateSeedanceTask } from "@/lib/piapiSeedance";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioVideoModel,
  parseAccountPlan,
  studioVideoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

type KlingAspectRatio = "16:9" | "9:16" | "1:1";
type KlingMode = "std" | "pro";

type Body = {
  /** Client plan (demo: localStorage). When set, premium models are rejected for lower tiers. */
  accountPlan?: string;
  /** Link to Ad video: do not gate by subscription tier (credits still apply in-app). */
  linkToAd?: boolean;
  // KIE Market model id (optional; defaults to Kling 3.0)
  marketModel?: string;
  prompt: string;
  imageUrl?: string;
  duration?: number; // seconds
  aspectRatio?: KlingAspectRatio; // optional if image is provided
  sound?: boolean;
  mode?: KlingMode;
  /** Kling 3.0 only — multi-shot sequencing */
  multiShots?: boolean;
  personalApiKey?: string;
  piapiApiKey?: string;
};

/**
 * KIE now requires separate model names for text-to-video vs image-to-video.
 * The client still sends the generic picker id; we resolve here based on whether an image is present.
 */
function resolveKieModelName(pickerModel: string, hasImage: boolean): string {
  switch (pickerModel) {
    case "kling-2.6/video":
      return hasImage ? "kling-2.6/image-to-video" : "kling-2.6/text-to-video";
    case "openai/sora-2":
      return hasImage ? "sora-2-image-to-video" : "sora-2-text-to-video";
    default:
      return pickerModel;
  }
}

function isKling26(model: string): boolean {
  return model === "kling-2.6/video" || model === "kling-2.6/image-to-video" || model === "kling-2.6/text-to-video";
}

function isSora2(model: string): boolean {
  return model === "openai/sora-2" || model === "sora-2-image-to-video" || model === "sora-2-text-to-video";
}

function isSora2Pro(model: string): boolean {
  return model === "openai/sora-2-pro";
}

function validateDurationForModel(model: string, duration: number | undefined) {
  if (duration == null) return;
  if (model === "kling-3.0/video") {
    if (duration < 3 || duration > 15) {
      throw new Error("Invalid duration for Kling 3.0. Must be between 3 and 15.");
    }
    return;
  }
  if (isKling26(model)) {
    if (duration !== 5 && duration !== 10) {
      throw new Error("Invalid duration for Kling 2.6. Must be 5 or 10.");
    }
    return;
  }
  if (isSora2(model)) {
    if (duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Sora 2. Must be 10 or 15.");
    }
    return;
  }
  if (isSora2Pro(model)) {
    if (duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Sora 2 Pro. Must be 10 or 15.");
    }
    return;
  }
  if (model === "bytedance/seedance-1.5-pro") {
    if (duration !== 5 && duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Seedance 1.5 Pro. Must be 5, 10, or 15.");
    }
    return;
  }
  if (model.startsWith("bytedance/seedance-2")) {
    if (duration !== 5 && duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Seedance 2. Must be 5, 10, or 15.");
    }
    return;
  }
  if (duration < 3 || duration > 30) {
    throw new Error("Invalid duration. Must be between 3 and 30.");
  }
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

  const rawModel = (body.marketModel ?? "kling-3.0/video").trim() || "kling-3.0/video";
  const imageUrl = (body.imageUrl ?? "").trim();
  const model = resolveKieModelName(rawModel, Boolean(imageUrl));
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }

  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  const piapiKey = hasPersonalApiKey(body.piapiApiKey) ? body.piapiApiKey.trim() : undefined;
  if (!personalKey && !piapiKey) {
    // Fetch plan from DB (server-side); fall back to client claim only if table not yet available
    const dbPlan = await getUserPlan(user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    const skipTierGate = body.linkToAd === true;
    if (!skipTierGate && !canUseStudioVideoModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error: studioVideoUpgradeMessage(accountPlan, model) ?? "Subscription upgrade required for this model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const mode = body.mode ?? "pro";
  try {
    validateDurationForModel(model, body.duration);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid duration." },
      { status: 400 },
    );
  }

  try {
    let input: any;
    if (model === "kling-3.0/video") {
      input = {
        prompt,
        sound: body.sound ?? true,
        duration: String(body.duration ?? 5),
        mode,
        multi_shots: Boolean(body.multiShots),
        multi_prompt: [],
      };

      if (imageUrl) {
        input.image_urls = [imageUrl];
        // KIE docs: when first-frame image is provided, aspect_ratio is invalid.
        // Safer: omit it to avoid server-side errors.
      } else {
        if (body.aspectRatio) input.aspect_ratio = body.aspectRatio;
      }
    } else if (isKling26(model)) {
      input = {
        prompt,
        sound: body.sound ?? false,
        duration: String(body.duration ?? 5),
      };
      if (imageUrl) {
        input.image_urls = [imageUrl];
      } else if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (isSora2(model) || isSora2Pro(model)) {
      const nFrames = String(body.duration ?? 10);
      const soraAspect =
        body.aspectRatio === "9:16" ? "portrait" : "landscape";
      input = {
        prompt,
        n_frames: nFrames,
        aspect_ratio: soraAspect,
        upload_method: "s3",
        remove_watermark: true,
      };
      if (imageUrl) {
        input.image_urls = [imageUrl];
      }
    } else if (model.startsWith("bytedance/seedance")) {
      if (!imageUrl) {
        return NextResponse.json(
          { error: "Seedance requires `imageUrl` (image-to-video)." },
          { status: 400 },
        );
      }
      let taskType: "seedance-2-preview" | "seedance-2-fast-preview";
      if (model === "bytedance/seedance-2-fast-preview" || model === "bytedance/seedance-1.5-pro") {
        taskType = "seedance-2-fast-preview";
      } else {
        taskType = "seedance-2-preview";
      }
      const duration = Number(body.duration ?? 10);
      const seedanceAspectRatio =
        body.aspectRatio === "1:1" ? ("4:3" as const) : (body.aspectRatio ?? "9:16");
      let piapiImageUrl = imageUrl;
      try {
        piapiImageUrl = await mirrorImageUrlForPiapiSeedance(imageUrl, user.id);
      } catch (mirrorErr) {
        logGenerationFailure("kling/generate/mirror-seedance-image", mirrorErr, {
          model,
          imageHost: (() => {
            try {
              return new URL(imageUrl).hostname;
            } catch {
              return "invalid";
            }
          })(),
        });
        return NextResponse.json(
          {
            error:
              mirrorErr instanceof Error
                ? mirrorErr.message
                : "Could not prepare the reference image for the video provider.",
          },
          { status: 502 },
        );
      }
      const rawTaskId = await piapiCreateSeedanceTask({
        taskType,
        prompt,
        imageUrl: piapiImageUrl,
        duration,
        aspectRatio: seedanceAspectRatio,
        overrideApiKey: piapiKey,
      });
      return NextResponse.json({
        taskId: encodePiapiTaskId(rawTaskId),
        provider: "piapi",
        model,
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported marketModel: ${model}` },
        { status: 400 },
      );
    }

    const taskId = await kieMarketCreateTask(
      { model, input },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model,
    });
  } catch (err) {
    logGenerationFailure("kling/generate", err, { model });
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}

