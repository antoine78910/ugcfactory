export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import {
  nanoBananaGenerate2,
  nanoBananaGeneratePro,
  type NanoBananaImageSize,
  type NanoBananaProAspectRatio,
  type NanoBananaProResolution,
} from "@/lib/nanobanana";
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
            studioImageUpgradeMessage(accountPlan, model) ?? "Subscription upgrade required for Nano Banana Pro.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }
  const num = clampNumImages(body.numImages);
  /** NanoBanana 2 defaults to 1K in docs; Pro callers usually pass explicit resolution. */
  const resolutionNano: NanoBananaProResolution = body.resolution ?? "1K";

  try {
    if (model === "pro") {
      const aspect = body.aspectRatio ?? body.imageSize ?? "auto";
      if (num <= 1) {
        const taskId = await nanoBananaGeneratePro({
          prompt,
          imageUrls,
          resolution: body.resolution,
          aspectRatio: aspect,
          callBackUrl,
        });
        return NextResponse.json({ taskId, model });
      }
      const taskIds = await Promise.all(
        Array.from({ length: num }, () =>
          nanoBananaGeneratePro({
            prompt,
            imageUrls,
            resolution: body.resolution,
            aspectRatio: aspect,
            callBackUrl,
          }),
        ),
      );
      return NextResponse.json({ taskIds, model });
    }

    // Studio "nano" → generate-2 (1K/2K/4K + same aspect API as docs)
    const aspectFor2 = body.aspectRatio ?? body.imageSize ?? "auto";
    if (num <= 1) {
      const taskId = await nanoBananaGenerate2({
        prompt,
        imageUrls,
        aspectRatio: aspectFor2,
        resolution: resolutionNano,
        callBackUrl,
      });
      return NextResponse.json({ taskId, model });
    }
    const taskIds = await Promise.all(
      Array.from({ length: num }, () =>
        nanoBananaGenerate2({
          prompt,
          imageUrls,
          aspectRatio: aspectFor2,
          resolution: resolutionNano,
          callBackUrl,
        }),
      ),
    );
    return NextResponse.json({ taskIds, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
