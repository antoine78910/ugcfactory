export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";

type Body = {
  url: string;
  analysis: unknown;
  productName?: string | null;
  productImages?: string[];
  quiz?: {
    videoDurationPreference?: string;
    persona?: string;
  };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url || !body.analysis) {
    return NextResponse.json({ error: "Missing `url` or `analysis`." }, { status: 400 });
  }

  const developer = [
    "You are an expert prompt engineer for photorealistic UGC-style product imagery.",
    "Return STRICT JSON only.",
    "Goal: create a single photorealistic image prompt that includes: the target persona + product naturally (in hands if possible).",
    "Make it look like authentic UGC but high-quality: realistic skin texture, natural lighting, no over-smoothing, no logos forced.",
    "If product is bulky, place it behind/next to the person instead of in hands.",
    "Write the prompt in ENGLISH.",
  ].join("\n");

  const user = [
    "Create a NanoBanana image prompt based on this analysis and optional product images.",
    "Output JSON with: { imagePrompt, negativePrompt, recommendedAspectRatio }",
    "",
    "Context:",
    JSON.stringify(
      {
        url: body.url,
        productName: body.productName ?? null,
        productImages: Array.isArray(body.productImages) ? body.productImages.slice(0, 6) : [],
        quiz: body.quiz ?? null,
        analysis: body.analysis,
      },
      null,
      2,
    ),
  ].join("\n");

  try {
    const { text } = await openaiResponsesText({ developer, user });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        imagePrompt: String(parsed?.imagePrompt ?? ""),
        negativePrompt: String(parsed?.negativePrompt ?? ""),
        recommendedAspectRatio: String(parsed?.recommendedAspectRatio ?? "9:16"),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

