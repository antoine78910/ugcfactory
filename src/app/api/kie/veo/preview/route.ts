export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type {
  KieVeoAspectRatio,
  KieVeoGenerationType,
  KieVeoModel,
} from "@/lib/kie";

type Body = {
  prompt?: string;
  model?: KieVeoModel | "veo3_fast";
  aspectRatio?: KieVeoAspectRatio;
  generationType?: KieVeoGenerationType;
  imageUrls?: string[];
  imageUrl?: string;
  enableTranslation?: boolean;
  watermark?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const normalizedImageUrls = Array.isArray(body?.imageUrls)
    ? body!.imageUrls!.filter((u) => typeof u === "string" && u.trim().length > 0)
    : body?.imageUrl
      ? [body.imageUrl]
      : [];

  const generationType =
    body?.generationType ??
    (normalizedImageUrls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO");

  return NextResponse.json({
    provider: "kie",
    product: "veo3.1",
    endpoint: "/api/v1/veo/generate",
    prompt: body?.prompt ?? "",
    model: body?.model === "veo3_fast" ? "veo3" : (body?.model ?? "veo3"),
    aspect_ratio: body?.aspectRatio ?? "16:9",
    generationType,
    imageUrls: normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined,
    enableTranslation: body?.enableTranslation ?? true,
    watermark: body?.watermark,
  });
}

