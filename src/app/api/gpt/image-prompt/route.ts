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
    "Return STRICT JSON only. Output JSON with: { imagePrompt, negativePrompt, recommendedAspectRatio }",
    "",
    "PROMPT STRUCTURE (follow this order exactly for imagePrompt):",
    "1. Opening line: 'Ultra-realistic UGC style image.' or 'Ultra-realistic lifestyle image.'",
    "2. Subject & setting: Age, gender, location (e.g. modern bathroom, minimalist bedroom, kitchen), time of day (e.g. morning). Natural daylight coming from a side window, soft and diffused. Realistic lighting, not studio light.",
    "3. Appearance: Hair (short, well-groomed, etc.), beard/stubble if relevant. Natural skin texture with subtle imperfections, fine lines if age-appropriate. No artificial smoothing.",
    "4. Clothing: Precise description (e.g. simple neutral t-shirt, fitted navy dress shirt, soft beige bathrobe)—fabric, fit, how it looks on the body.",
    "5. Pose & expression: Where they stand (e.g. in front of mirror facing camera, three-quarter angle). Relaxed posture. Calm, confident expression. What they do with hands if relevant.",
    "6. Product (if any): How they hold it (e.g. at chest level, one hand). Logo clearly visible and readable. Product realistic, correct lighting and shadows. If bulky, place next to person.",
    "7. Background: Modern clean setting, simple elements visible. Not overly staged. Slight depth of field but realistic.",
    "8. Closing quality lines (include these or similar):",
    "   - Natural UGC aesthetic. / Authentic UGC aesthetic.",
    "   - No artificial blur on skin.",
    "   - No glamour effect. / No studio glamour lighting.",
    "   - No fashion photoshoot vibe. (if relevant)",
    "   - Realistic shadows and fabric texture.",
    "   - 4K photorealistic. (optional)",
    "Write the entire imagePrompt in ENGLISH. Keep negativePrompt short (unwanted styles, cartoon, blur, etc.).",
  ].join("\n");

  const userPrompt = [
    "Create an image prompt based on this analysis and optional product images.",
    "Follow the PROMPT STRUCTURE exactly: opening line, subject & setting with natural daylight, appearance with natural skin texture, clothing details, pose & expression, product placement if any, background, then closing quality lines (Natural UGC aesthetic, No artificial blur, No glamour, etc.).",
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
      negativePrompt: String(parsed?.negativePrompt ?? ""),
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

