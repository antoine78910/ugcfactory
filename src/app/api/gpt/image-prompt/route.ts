export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";

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
  const { supabase, user: authUser, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url || !body.analysis) {
    return NextResponse.json({ error: "Missing `url` or `analysis`." }, { status: 400 });
  }

  const developer = [
    "You are an expert prompt engineer for photorealistic UGC-style product imagery.",
    "Return STRICT JSON only. Output JSON with: { imagePrompt, recommendedAspectRatio }",
    "",
    "Goal: write a SHORT, natural image prompt in ENGLISH that looks like a real UGC / lifestyle description, similar in style and length to this kind of prompt:",
    "Example:",
    "Ultra-realistic UGC style image. A 28-year-old man standing in a modern bathroom in the morning. Natural daylight coming from a side window, soft and diffused. He has short dark hair and natural beard growth with slight patchiness visible, natural skin texture with subtle imperfections. He is wearing a simple neutral t-shirt. He stands in front of a bathroom mirror but is facing the camera directly, relaxed posture, calm confident expression with a slight natural smile. He holds a product labeled “Regrowave” naturally at chest level with one hand, logo clearly visible and readable. Modern clean bathroom background, simple sink and mirror visible, not overly staged, slight realistic depth of field.",
    "",
    "Requirements for imagePrompt:",
    "- 1–2 short paragraphs, 3–7 sentences total (roughly 40–120 words).",
    "- Natural language, no numbered lists or bullet points.",
    "- Describe: subject, setting, clothing, pose/expression, product placement, background, and optionally 1–2 quality phrases like “Ultra-realistic UGC style image.” or “Natural UGC aesthetic. No studio glamour lighting.”",
    "- Do NOT include a separate “Negative” section or any negative prompt text.",
  ].join("\n");

  const userPrompt = [
    "Create a concise image prompt based on this analysis and optional product images.",
    "Follow the style of the Example above: short UGC-style description in 1–2 paragraphs (3–7 sentences), not a long over-engineered prompt.",
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
    const cacheKey = makeCacheKey({
      v: 1,
      url: body.url,
      productName: body.productName ?? null,
      productImages: Array.isArray(body.productImages) ? body.productImages.slice(0, 6) : [],
      quiz: body.quiz ?? null,
      analysis: body.analysis,
    });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "image_prompt")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) return NextResponse.json({ data: hit.output, cached: true });
    } catch {
      // ignore cache failures
    }

    const { text } = await openaiResponsesText({ developer, user: userPrompt });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    const data = {
      imagePrompt: String(parsed?.imagePrompt ?? ""),
      // Keep negativePrompt empty on purpose: we now generate only a single, short positive prompt.
      negativePrompt: "",
      recommendedAspectRatio: String(parsed?.recommendedAspectRatio ?? "9:16"),
    };

    try {
      await supabase
        .from("gpt_cache")
        .insert({ user_id: authUser.id, kind: "image_prompt", cache_key: cacheKey, output: data })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

