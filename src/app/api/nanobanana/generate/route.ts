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

type Body = {
  accountPlan?: string;
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

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
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
      { error: "Image generation is not configured on the server (missing KIE_API_KEY). Add a personal API key in settings or configure the platform key." },
      { status: 503 },
    );
  }
  if (!personalKey) {
    const dbPlan = await getUserPlan(supabase, user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    if (!canUseStudioImagePickerModel(accountPlan, model)) {
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
    const { taskId, taskIds, kieModel } = await createStudioKieImageTasks({
      prompt,
      model,
      imageUrl: body.imageUrl,
      imageUrls: body.imageUrls,
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
