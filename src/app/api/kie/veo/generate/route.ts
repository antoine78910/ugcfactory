export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieVeoGenerate,
  type KieVeoAspectRatio,
  type KieVeoGenerationType,
  type KieVeoModel,
} from "@/lib/kie";
import { canUseVeoApiModel, parseAccountPlan, veoUpgradeMessage } from "@/lib/subscriptionModelAccess";

type Body = {
  accountPlan?: string;
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
  if (body?.accountPlan != null && String(body.accountPlan).trim() !== "") {
    const accountPlan = parseAccountPlan(body.accountPlan);
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
    const taskId = await kieVeoGenerate({
      prompt,
      model: veoModel,
      aspect_ratio: body?.aspectRatio ?? "16:9",
      generationType,
      imageUrls: normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined,
      enableTranslation: body?.enableTranslation ?? true,
      watermark: body?.watermark,
    });

    return NextResponse.json({
      taskId,
      generationType,
      model: body?.model ?? "veo3_fast",
      aspect_ratio: body?.aspectRatio ?? "16:9",
      imageCount: normalizedImageUrls.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

