export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type TemplateId = "template1" | "template2" | "template3";

type Body = {
  url: string;
  analysis: unknown;
  quiz: Record<string, unknown>;
  templateId: TemplateId;
  productName?: string | null;
};

export async function POST(req: Request) {
  const { supabase, user: authUser, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url || !body.analysis || !body.quiz || !body.templateId) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Template style = global style / angle, not placeholder-based anymore.
  const templateStyle = (() => {
    switch (body.templateId) {
      case "template1":
        return "Template 1 — UGC smartphone authentique (POV / selfie), handheld front camera, face-to-camera, direct talk, simple background.";
      case "template2":
        return "Template 2 — Beauty / wellness cinematic UGC, medium close-up, soft natural light, elegant minimal background, gentle movements.";
      case "template3":
        return "Template 3 — Storytelling / problem-solution UGC, medium shot, small story arc (before/after), honest tone, natural gestures.";
    }
  })();

  const developer = [
    "You are a UGC scriptwriter and prompt engineer for video generation models.",
    "Return STRICT JSON only. Output JSON with: { filledPrompt, recommendedTemplateReason }",
    "",
    "Goal: based on the product analysis + quiz (angles, benefits, problems, promises, persona, offers, etc.), create ONE short UGC video prompt/script inspired by the style examples below.",
    "",
    "VERY IMPORTANT:",
    "- ALWAYS write the filledPrompt in ENGLISH, as a natural spoken script, even if the input/context is in French.",
    "- The filledPrompt should describe the camera, shots, actions and EXACT spoken lines (in English).",
    "- It should read like one of these examples (but adapted to the specific product, angles and persona):",
    "",
    "Example 1:",
    "A close-up, eye-level shot of a woman in a bright, modern bathroom with natural daylight. She wears a beige headband and a neutral t-shirt. Her skin looks fresh and hydrated. She looks into the camera with a relaxed smile and casually says: “Okay guys, I’ve been getting so many questions about the face cream I’m using lately…” The camera shifts to a shallow depth-of-field shot as she holds the Enjoy face cream close to the lens, the logo clearly visible. Her face stays softly blurred in the background as she continues: “It’s this one, the Enjoy face cream. It hydrates really well and just makes my skin look healthier.” The scene transitions to a medium shot in front of the bathroom mirror where she applies a small amount of the cream, gently massaging it in, then smiles at her reflection and adds: “I use it every day, and honestly, my skin has never felt this good.” She looks back at the camera, confident and satisfied. POV shot, handheld, subtle movement, natural daylight, no subtitles, no music.",
    "",
    "Example 2:",
    "POV shot, eye-level, handheld very subtle. A charming brunette woman with a beautiful face, light freckles, realistic skin texture and natural facial details. She is wearing a tailored suit and high heels. She looks directly into the camera and says confidently: “Guys, I have incredible news for you.” Natural daylight, intimate and engaging tone. The camera moves in front of her and follows her smoothly, maintaining eye contact. A subtle pan and close-up framing as she speaks while walking: “In 2026, you no longer need to pay UGC creators, thanks to AI.” Clean, cinematic, professional atmosphere. Medium close-up, eye-level, tracking shot. The woman stops, faces the camera, a calm confident smile appears and she says clearly: “If you want to know more, send a DM to Paul Yanis.”",
    "",
    "Example 3:",
    "A realistic, cinematic bathroom scene with soft natural daylight reflecting on tiled walls. The camera starts slightly above and behind the woman’s shoulder, framing her reflection in the mirror. She is standing relaxed at the sink, holding a skincare cream tube, looking at herself with calm confidence, her facial expressions clearly visible in the mirror as she says in English: “Since I started using this cream, my acne has completely disappeared.” The camera then moves smoothly to the front into a medium shot as she raises the cream toward the camera, making sure the label is visible. She continues: “That’s why, girls, you should all start using it.” The camera moves back behind her shoulder to the original mirror perspective as she smiles at her reflection, visibly happy and confident. The video ends naturally on her smiling at herself in the mirror.",
    "",
    "Requirements for filledPrompt:",
    "- Plain text script, 1–3 short paragraphs, no bullet points, no placeholders, no variable names.",
    "- Use the strongest angles/benefits/persona from the context to decide what is said and how it’s shown.",
    "- Match the chosen template style (POV selfie / cinematic beauty / storytelling) described separately.",
    "- Do NOT write in French; always output English spoken lines.",
  ].join("\n");

  const userPrompt = [
    "Create a single UGC video prompt/script (filledPrompt) in ENGLISH, inspired by the style examples and using the context below.",
    "",
    "Template style (high-level):",
    templateStyle,
    "",
    "Context JSON (product, analysis, quiz with angles/benefits/problems/persona/offers, etc.):",
    JSON.stringify(
      {
        url: body.url,
        productName: body.productName ?? null,
        templateId: body.templateId,
        quiz: body.quiz,
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
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    const data = {
      filledPrompt: String(parsed?.filledPrompt ?? ""),
      recommendedTemplateReason: String(parsed?.recommendedTemplateReason ?? ""),
    };

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

