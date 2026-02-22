export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  kieVeoGenerate,
  type KieVeoAspectRatio,
  type KieVeoGenerationType,
  type KieVeoModel,
} from "@/lib/kie";

type Body = {
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

  try {
    const taskId = await kieVeoGenerate({
      prompt,
      model: body?.model ?? "veo3_fast",
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

