export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieVeoGenerate,
  type KieVeoAspectRatio,
  type KieVeoGenerationType,
  type KieVeoModel,
} from "@/lib/kie";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import { canUseVeoApiModel, parseAccountPlan, veoUpgradeMessage } from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

type Body = {
  accountPlan?: string;
  personalApiKey?: string;
  prompt: string;
  model?: KieVeoModel;
  aspectRatio?: KieVeoAspectRatio;
  generationType?: KieVeoGenerationType;
  imageUrls?: string[];
  imageUrl?: string;
  enableTranslation?: boolean;
  watermark?: string;
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;

  const prompt = (body?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }

  const normalizedImageUrls = Array.isArray(body?.imageUrls)
    ? body!.imageUrls!.filter((u) => typeof u === "string" && u.trim().length > 0)
    : body?.imageUrl
      ? [body.imageUrl]
      : [];

  const generationType: KieVeoGenerationType =
    body?.generationType ??
    (normalizedImageUrls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO");

  const veoModel = body?.model ?? "veo3_fast";
  const personalKey =
    body && hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  if (!personalKey) {
    const dbPlan = await getUserPlan(supabase, user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body?.accountPlan);
    if (!canUseVeoApiModel(accountPlan, veoModel)) {
      return NextResponse.json(
        {
          error: veoUpgradeMessage(accountPlan, veoModel) ?? "Subscription upgrade required for this Veo model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  try {
    const taskId = await kieVeoGenerate(
      {
        prompt,
        model: veoModel,
        aspect_ratio: body?.aspectRatio ?? "16:9",
        generationType,
        imageUrls: normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined,
        enableTranslation: body?.enableTranslation ?? true,
        watermark: body?.watermark,
      },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      generationType,
      model: body?.model ?? "veo3_fast",
      aspect_ratio: body?.aspectRatio ?? "16:9",
      imageCount: normalizedImageUrls.length,
    });
  } catch (err) {
    logGenerationFailure("kie/veo/generate", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}

