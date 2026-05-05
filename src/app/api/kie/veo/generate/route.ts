export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieVeoGenerate,
  normalizeKieVeoModel,
  type KieVeoAspectRatio,
  type KieVeoGenerationType,
  type KieVeoModel,
} from "@/lib/kie";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import { canUseVeoApiModel, parseAccountPlan, veoUpgradeMessage } from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { shouldChargePlatformCredits, assertSufficientCreditsResponse } from "@/lib/credits/metering";
import { calculateVeo31Credits } from "@/lib/pricing";

type Body = {
  accountPlan?: string;
  personalApiKey?: string;
  prompt: string;
  model?: KieVeoModel | string;
  aspectRatio?: KieVeoAspectRatio;
  generationType?: KieVeoGenerationType;
  imageUrls?: string[];
  imageUrl?: string;
  enableTranslation?: boolean;
  watermark?: string;
};

export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
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

  let generationType: KieVeoGenerationType =
    body?.generationType ??
    (normalizedImageUrls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO");

  const veoModel = normalizeKieVeoModel(body?.model);
  // REFERENCE_2_VIDEO is Fast-only per KIE; coerce otherwise.
  if (generationType === "REFERENCE_2_VIDEO" && veoModel !== "veo3_fast") {
    generationType =
      normalizedImageUrls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO";
  }
  const personalKey =
    body && hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  let dbPlanResolved: string | null = null;
  if (!personalKey) {
    const dbPlan = await getUserPlan(user.id);
    dbPlanResolved = dbPlan;
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

  const usesPersonalApi = Boolean(personalKey);
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(user, admin);
  const charges = shouldChargePlatformCredits({ usesPersonalApi, email });
  if (charges && admin) {
    const costDisplayCredits = calculateVeo31Credits(veoModel);
    const dbPlan = dbPlanResolved ?? (await getUserPlan(user.id));
    const gate = await assertSufficientCreditsResponse({
      admin,
      userId: user.id,
      planId: dbPlan ?? "free",
      costDisplayCredits,
    });
    if (gate) return gate;
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
      provider: "kie-veo",
      generationType,
      model: veoModel,
      aspect_ratio: body?.aspectRatio ?? "16:9",
      imageCount: normalizedImageUrls.length,
    });
  } catch (err) {
    logGenerationFailure("kie/veo/generate", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}

