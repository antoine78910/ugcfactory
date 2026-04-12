export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { mirrorImageUrlForPiapiSeedance } from "@/lib/mirrorImageUrlForPiapi";
import { resolveKieVideoPickerToMarketModel } from "@/lib/kieVideoModelResolver";
import { encodePiapiTaskId, piapiCreateSeedanceTask, type PiapiSeedanceTaskType } from "@/lib/piapiSeedance";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioVideoModel,
  parseAccountPlan,
  studioVideoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";
import { isKieServableReferenceImageUrl } from "@/lib/kieSoraReferenceImage";

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

function isKling26(model: string): boolean {
  return (
    model === "kling-2.6/video" ||
    model === "kling-2.6/image-to-video" ||
    model === "kling-2.6/text-to-video"
  );
}

function isSora2(model: string): boolean {
  return (
    model === "openai/sora-2" ||
    model === "sora-2-image-to-video" ||
    model === "sora-2-text-to-video"
  );
}

function isSora2Pro(model: string): boolean {
  return (
    model === "openai/sora-2-pro" ||
    model === "sora-2-pro-text-to-video" ||
    model === "sora-2-pro-image-to-video"
  );
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
  if (model === "bytedance/seedance-2" || model === "bytedance/seedance-2-fast") {
    const d = Number(duration);
    if (!Number.isFinite(d) || d < 4 || d > 15 || Math.round(d) !== d) {
      throw new Error("Invalid duration for Seedance 2. Must be an integer from 4 to 15 seconds.");
    }
    return;
  }
  if (model === "bytedance/seedance-2-preview" || model === "bytedance/seedance-2-fast-preview") {
    if (duration !== 5 && duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Seedance 2 Preview. Must be 5, 10, or 15.");
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
  const imageUrlRaw = (body.imageUrl ?? "").trim();
  const hasKieReferenceImage = isKieServableReferenceImageUrl(imageUrlRaw);
  const model = resolveKieVideoPickerToMarketModel(rawModel, hasKieReferenceImage);
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
    let input: Record<string, unknown>;
    if (model === "kling-3.0/video") {
      input = {
        prompt,
        sound: body.sound ?? true,
        duration: String(body.duration ?? 5),
        mode,
        multi_shots: Boolean(body.multiShots),
        multi_prompt: [],
      };

      if (hasKieReferenceImage) {
        input.image_urls = [imageUrlRaw];
        // KIE docs: when first-frame image is provided, aspect_ratio is invalid.
      } else {
        if (body.aspectRatio) input.aspect_ratio = body.aspectRatio;
      }
    } else if (isKling26(model)) {
      input = {
        prompt,
        sound: body.sound ?? false,
        duration: String(body.duration ?? 5),
      };
      if (hasKieReferenceImage) {
        input.image_urls = [imageUrlRaw];
      } else if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (isSora2(model) || isSora2Pro(model)) {
      const nFrames = String(body.duration ?? 10);
      const soraAspect = body.aspectRatio === "9:16" ? "portrait" : "landscape";
      const soraSize = (body.mode ?? "pro") === "pro" ? "high" : "standard";
      input = {
        prompt,
        n_frames: nFrames,
        aspect_ratio: soraAspect,
        size: soraSize,
        upload_method: "s3",
        remove_watermark: true,
      };
      if (hasKieReferenceImage) {
        input.image_urls = [imageUrlRaw];
      }
    } else if (rawModel.startsWith("bytedance/seedance")) {
      const SEEDANCE_TASK: Record<string, PiapiSeedanceTaskType> = {
        "bytedance/seedance-2": "seedance-2",
        "bytedance/seedance-2-fast": "seedance-2-fast",
        "bytedance/seedance-2-preview": "seedance-2-preview",
        "bytedance/seedance-2-fast-preview": "seedance-2-fast-preview",
      };
      const taskType = SEEDANCE_TASK[rawModel];
      if (!taskType) {
        return NextResponse.json({ error: `Unsupported Seedance model: ${rawModel}` }, { status: 400 });
      }
      const preview = taskType === "seedance-2-preview" || taskType === "seedance-2-fast-preview";
      if (preview && !hasKieReferenceImage) {
        return NextResponse.json(
          { error: "This Seedance preview model requires `imageUrl` (image-to-video)." },
          { status: 400 },
        );
      }
      const duration = Number(body.duration ?? 10);
      const seedanceAspectRatio =
        body.aspectRatio === "1:1" ? ("4:3" as const) : (body.aspectRatio ?? "9:16");
      let piapiImageUrl: string | undefined;
      if (hasKieReferenceImage) {
        try {
          piapiImageUrl = await mirrorImageUrlForPiapiSeedance(imageUrlRaw, user.id);
        } catch (mirrorErr) {
          logGenerationFailure("kling/generate/mirror-seedance-image", mirrorErr, {
            model,
            imageHost: (() => {
              try {
                return new URL(imageUrlRaw).hostname;
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

    const taskId = await kieMarketCreateTask({ model, input }, personalKey);

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
