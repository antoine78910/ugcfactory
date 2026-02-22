export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAppUrl, getEnv } from "@/lib/env";
import {
  nanoBananaGenerate,
  nanoBananaGeneratePro,
  type NanoBananaImageSize,
  type NanoBananaProAspectRatio,
  type NanoBananaProResolution,
} from "@/lib/nanobanana";

type Body = {
  prompt: string;
  language?: "fr" | "en";
  model?: "nano" | "pro";
  imageUrl?: string; // legacy single image
  imageUrls?: string[]; // preferred multi-image
  imageSize?: NanoBananaImageSize;
  numImages?: number;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
};

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

  try {
    const taskId =
      model === "pro"
        ? await nanoBananaGeneratePro({
            prompt,
            imageUrls,
            resolution: body.resolution,
            aspectRatio: body.aspectRatio ?? body.imageSize,
            callBackUrl,
          })
        : await nanoBananaGenerate({
            prompt,
            type: imageUrls ? "IMAGETOIAMGE" : "TEXTTOIAMGE",
            callBackUrl,
            imageUrls,
            numImages: body.numImages,
            image_size: body.imageSize,
          });

    return NextResponse.json({ taskId, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

