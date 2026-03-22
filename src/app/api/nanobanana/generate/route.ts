export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import {
  buildKieGoogleImageInput,
  kieMarketModelForStudioImage,
  type KieGoogleImageResolution,
} from "@/lib/kieGoogleImage";
import type { NanoBananaImageSize, NanoBananaProAspectRatio, NanoBananaProResolution } from "@/lib/nanobanana";
import {
  canUseStudioImageModel,
  parseAccountPlan,
  studioImageUpgradeMessage,
} from "@/lib/subscriptionModelAccess";

type Body = {
  accountPlan?: string;
  prompt: string;
  language?: "fr" | "en";
  model?: "nano" | "pro";
  imageUrl?: string;
  imageUrls?: string[];
  imageSize?: NanoBananaImageSize;
  numImages?: number;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
};

function clampNumImages(n: unknown): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return 1;
  return Math.min(4, Math.max(1, x));
}

export async function POST(req: Request) {
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

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

  const normalizedImageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0)
    : body.imageUrl
      ? [body.imageUrl]
      : [];

  const imageUrls = normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined;
  const model = body.model ?? "nano";
  if (body.accountPlan != null && String(body.accountPlan).trim() !== "") {
    const accountPlan = parseAccountPlan(body.accountPlan);
    if (!canUseStudioImageModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error:
            studioImageUpgradeMessage(accountPlan, model) ??
            "Subscription upgrade required for Nano Banana Pro.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }
  const num = clampNumImages(body.numImages);
  const resolutionNano = (body.resolution ?? "1K") as KieGoogleImageResolution;
  const kieModel = kieMarketModelForStudioImage(model);
  const aspectFor = body.aspectRatio ?? body.imageSize ?? "auto";

  try {
    const runOne = () =>
      kieMarketCreateTask({
        model: kieModel,
        callBackUrl,
        input: buildKieGoogleImageInput({
          prompt,
          aspectRatio: typeof aspectFor === "string" ? aspectFor : "auto",
          resolution: resolutionNano,
          imageUrls,
        }),
      });

    if (num <= 1) {
      const taskId = await runOne();
      return NextResponse.json({ taskId, model, provider: "kie-market", kieModel });
    }
    const taskIds = await Promise.all(Array.from({ length: num }, () => runOne()));
    return NextResponse.json({ taskIds, model, provider: "kie-market", kieModel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
