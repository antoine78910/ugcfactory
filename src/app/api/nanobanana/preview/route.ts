export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type {
  NanoBananaImageSize,
  NanoBananaProAspectRatio,
  NanoBananaProResolution,
} from "@/lib/nanobanana";

type Body = {
  model?: "nano" | "pro";
  prompt?: string;
  imageUrls?: string[];
  numImages?: number;
  imageSize?: NanoBananaImageSize;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const model = body?.model ?? "nano";
  const imageUrls =
    Array.isArray(body?.imageUrls) && body!.imageUrls!.length > 0
      ? body!.imageUrls!.filter((u) => typeof u === "string" && u.trim().length > 0)
      : [];

  if (model === "pro") {
    return NextResponse.json({
      model,
      endpoint: "/api/v1/nanobanana/generate-pro",
      prompt: body?.prompt ?? "",
      imageUrls,
      resolution: body?.resolution ?? "2K",
      aspectRatio: body?.aspectRatio ?? body?.imageSize ?? "4:5",
    });
  }

  return NextResponse.json({
    model,
    endpoint: "/api/v1/nanobanana/generate",
    prompt: body?.prompt ?? "",
    type: imageUrls.length > 0 ? "IMAGETOIAMGE" : "TEXTTOIAMGE",
    imageUrls,
    numImages: body?.numImages ?? 1,
    image_size: body?.imageSize ?? "4:5",
  });
}

