export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createStudioKieImageTasks } from "@/lib/studioKieImageTask";
import type { NanoBananaImageSize, NanoBananaProAspectRatio, NanoBananaProResolution } from "@/lib/nanobanana";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioImagePickerModel,
  parseAccountPlan,
  studioImagePickerUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { isStudioImageKiePickerModelId } from "@/lib/studioImageModels";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { serverLog } from "@/lib/serverLog";
import { getEnv } from "@/lib/env";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";
import { mergeNanoPromptForApi, splitNanoPromptBodyForEditing } from "@/lib/linkToAdUniverse";
import { LINK_TO_AD_NANO_IMAGE_SERVER_SUFFIX } from "@/lib/linkToAd/nanoImageServerSuffix";

type Body = {
  accountPlan?: string;
  /** Link to Ad image: do not gate by subscription tier (credits still apply in-app). */
  linkToAd?: boolean;
  prompt: string;
  language?: "fr" | "en";
  model?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageSize?: NanoBananaImageSize;
  numImages?: number;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
  personalApiKey?: string;
};

function firstHttpUrl(items: Array<string | null | undefined>): string | undefined {
  for (const raw of items) {
    const value = (raw ?? "").trim();
    if (/^https?:\/\//i.test(value)) return value;
  }
  return undefined;
}

/**
 * Collect every distinct HTTPS reference URL provided by the caller.
 * Used by Link to Ad mode so persona/avatar images uploaded by the user reach the
 * image-gen model alongside the product reference (cap mirrors GPT Image 2's 16-input limit).
 */
function collectHttpUrls(items: Array<string | null | undefined>, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const value = (raw ?? "").trim();
    if (!value || !/^https?:\/\//i.test(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(req: Request) {
  serverLog("nanobanana_generate_in", { url: req.url });
  const { user, response } = await requireSupabaseUser();
  if (response) {
    serverLog("nanobanana_generate_unauth", {});
    return response;
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    serverLog("nanobanana_generate_bad_json", {});
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  serverLog("nanobanana_generate_body", {
    model: body.model,
    linkToAd: body.linkToAd === true,
    imagesCount: Array.isArray(body.imageUrls) ? body.imageUrls.length : 0,
    aspectRatio: body.aspectRatio,
    promptLen: typeof body.prompt === "string" ? body.prompt.length : 0,
  });

  let prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }
  if (body.linkToAd === true) {
    const { editable, technicalTail } = splitNanoPromptBodyForEditing(prompt);
    const tail = technicalTail.trim() ? technicalTail : LINK_TO_AD_NANO_IMAGE_SERVER_SUFFIX;
    prompt = mergeNanoPromptForApi(editable, tail).trim();
  }

  const rawModel = body.model ?? "nano";
  const model = typeof rawModel === "string" ? rawModel.trim() : "nano";
  if (!isStudioImageKiePickerModelId(model)) {
    return NextResponse.json({ error: "Invalid image model." }, { status: 400 });
  }
  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  if (!personalKey && !getEnv("KIE_API_KEY")?.trim()) {
    serverLog("nanobanana_generate_config", { error: "missing_kie_key" });
    return NextResponse.json(
      {
        error:
          "Image generation is not configured on the server. Add a personal API key in settings or ask your admin to configure the platform.",
      },
      { status: 503 },
    );
  }
  if (!personalKey) {
    const dbPlan = await getUserPlan(user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    const skipTierGate = body.linkToAd === true;
    if (!skipTierGate && !canUseStudioImagePickerModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error:
            studioImagePickerUpgradeMessage(accountPlan, model) ??
            "Subscription upgrade required for this image model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  try {
    const linkToAdRefs =
      body.linkToAd === true
        ? collectHttpUrls(
            [body.imageUrl, ...(Array.isArray(body.imageUrls) ? body.imageUrls : [])],
            16,
          )
        : undefined;
    const imageUrl = body.linkToAd === true ? linkToAdRefs?.[0] : body.imageUrl;
    const imageUrls =
      body.linkToAd === true
        ? linkToAdRefs && linkToAdRefs.length > 0
          ? linkToAdRefs
          : undefined
        : body.imageUrls;

    const { taskId, taskIds, kieModel } = await createStudioKieImageTasks({
      prompt,
      model,
      imageUrl,
      imageUrls,
      imageSize: body.imageSize,
      numImages: body.numImages,
      resolution: body.resolution,
      aspectRatio: body.aspectRatio,
      personalApiKey: body.personalApiKey,
    });
    if (taskId) {
      serverLog("nanobanana_generate_ok", { model, kieModel, hasTaskId: true });
      return NextResponse.json({ taskId, model, provider: "kie-market", kieModel });
    }
    serverLog("nanobanana_generate_ok", {
      model,
      kieModel,
      taskCount: Array.isArray(taskIds) ? taskIds.length : 0,
    });
    return NextResponse.json({ taskIds, model, provider: "kie-market", kieModel });
  } catch (err) {
    logGenerationFailure("nanobanana/generate", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
