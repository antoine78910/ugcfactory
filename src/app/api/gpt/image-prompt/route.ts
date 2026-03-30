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
    "Goal: from the context (analysis + quiz with angles, benefits, problems, persona, etc.), write ONE simple text-to-image prompt that looks like a real UGC / lifestyle description.",
    "",
    "STYLE & TONE — mimic these examples (do NOT copy them literally, just follow their length and structure):",
    "",
    "Example 1 (EN):",
    "Generate a realistic image of this man in a modern bathroom looking at himself in the mirror with a confident, self-assured vibe—he feels good, the shirt fits well and flatters his shape, his stomach does not look bulky, his shoulders and arms look strong with good posture, and he adjusts his collar slightly as if neatening it with quiet confidence.",
    "",
    "Example 2 (EN):",
    "A realistic, natural-looking woman in her early 50s, wearing a soft beige bathrobe, standing in a bright, minimalist bathroom. She is facing a mirror, seen in a three-quarter angle reflection. Small dots of beige foundation are visible on her cheeks, forehead, and chin. She holds the Salty Beauty foundation bottle in one hand, the other hand raised near her face, about to blend the product. Soft natural daylight coming from a window, clean neutral tones, realistic skin texture with fine lines visible. Elegant, calm, authentic beauty routine atmosphere. Ultra-realistic photography, natural light, shallow depth of field.",
    "",
    "Example 3 (EN):",
    "Ultra-realistic lifestyle image. A confident 30-year-old man standing in a modern minimalist bedroom in the morning. Natural daylight coming from a side window, soft and diffused. He is wearing a perfectly fitted navy blue dress shirt: smooth fabric, wrinkle-free, structured collar, slim fit, making his shoulders and arms look broader and stronger while the midsection stays clean and smooth. He has short well-groomed hair and light stubble, natural skin texture with realistic details. He is standing upright with straight posture, slightly adjusting his cuff with one hand, calm confident expression, subtle masculine presence. Modern neutral bedroom background with minimal decor and slight realistic depth of field. Authentic UGC aesthetic, no studio glamour lighting, realistic fabric texture.",
    "",
    "Example 4 (EN):",
    "Ultra-realistic UGC style image. A 28-year-old man standing in a modern bathroom in the morning. Natural daylight coming from a side window, soft and diffused. He has short dark hair and natural beard growth with slight patchiness visible; natural skin texture with subtle imperfections. He is wearing a simple neutral t-shirt. He stands in front of a bathroom mirror but is facing the camera directly, relaxed posture, calm confident expression with a slight natural smile. He holds a product labeled “Regrowave” naturally at chest level with one hand, logo clearly visible and readable. Modern clean bathroom background with a simple sink and mirror, not overly staged, slight realistic depth of field. Natural UGC aesthetic, no artificial blur on skin, no glamour effect.",
    "",
    "Requirements for imagePrompt:",
    "- Short, natural description (similar length to the examples above).",
    "- Plain text, 1 simple block (no bullet points, no numbered lists, no sections).",
    "- Use the strongest angles, benefits, problems, promises and persona from the analysis/quiz to choose the scene, pose, expression and details — but do NOT mention words like “angle”, “benefit”, “persona” in the text.",
    "- The prompt should read like you’re briefly describing the final image to a designer or photographer.",
    "- Do NOT include any separate “Negative” part or negative prompt.",
  ].join("\n");

  const userPrompt = [
    "Using the analysis and quiz (angles, benefits, problems, promises, persona, etc.) plus the optional product images, create ONE simple UGC-style image prompt inspired by the Examples above.",
    "Keep it short and natural, like a brief description you would give to an artist or photographer. No bullets, no lists, no headings, no Negative section — just a single block of text.",
    "If the analysis / quiz text is mostly French, write the imagePrompt in French. Otherwise, write it in English.",
    "",
    "Context:",
    JSON.stringify(
      {
        url: body.url,
        productName: body.productName ?? null,
        productImages: Array.isArray(body.productImages) ? body.productImages.slice(0, 3) : [],
        quiz: body.quiz ?? null,
        analysis: body.analysis,
      },
      null,
      2,
    ),
  ].join("\n");

  try {
    const { text } = await openaiResponsesText({ developer, user: userPrompt });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON." }, { status: 502 });
    }

    const data = {
      imagePrompt: String(parsed?.imagePrompt ?? ""),
      // Keep negativePrompt empty on purpose: we now generate only a single, short positive prompt.
      negativePrompt: "",
      recommendedAspectRatio: String(parsed?.recommendedAspectRatio ?? "9:16"),
    };

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

