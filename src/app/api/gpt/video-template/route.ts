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

  // Kling is currently fixed to 15s in the generation step.
  // We still read quiz preference so GPT can keep spoken lines short enough.
  const preferredDuration = String(body.quiz?.videoDurationPreference ?? "15s");
  const targetDurationSec =
    preferredDuration === "20s" || preferredDuration === "30s" ? 15 : 15;

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
    "Example 4 (image-to-video, beard product):",
    "Handheld, front-facing smartphone shot. Slight natural shake, authentic phone camera vibe. Eye-level angle. Natural daylight coming from a nearby window. Background: simple real bathroom, slightly lived-in but realistic. A 31-year-old man wearing a light grey t-shirt with natural skin texture, visible pores, mild beard patchiness on cheeks and slight redness near the jawline, no heavy smoothing. At the beginning, he tilts his head slightly and points to a thinner patch on his cheek with his finger and says in a calm, honest tone: “If your beard’s patchy and oils aren’t working, it’s probably just sitting on the surface.” He moves a bit closer to the camera, maintaining eye contact, and lifts the exact Regrowave™ Beard Growth System device (same as the reference image, no box) naturally toward the lens so the logo is visible but not forced. He continues: “That was my problem.” While saying this, he holds the device steady near his beard, clearly showing the micro-infusion tip area. His tone shifts slightly more confident as he says: “This uses micro-infusion so the serum actually goes deeper. Way different than just rubbing oil on top.” He physically demonstrates by removing the small transparent protective cap from the device, revealing the micro-infusion tips (no box visible, only the device). A very subtle micro push-in camera movement accompanies this. He gently presses the device onto the patchy area of his beard in slow, controlled stamping motions (no exaggerated pressure), then finishes with a relaxed smile: “It feels like light exfoliation. Takes under a minute. They’ve got a 90-day growth guarantee, so try it.” After stamping, he places the device out of frame and uses both hands to massage the treated area in small circular motions while finishing the sentence. No subtitles, no music, natural ambient sound only, realistic skin texture, no exaggerated gestures, the product looks physically present and used in real time.",
    "",
    "Requirements for filledPrompt:",
    "- Plain text script, 1–3 short paragraphs, no bullet points, no placeholders, no variable names.",
    "- Use the strongest angles/benefits/persona from the context to decide what is said and how it’s shown.",
    "- Match the chosen template style (POV selfie / cinematic beauty / storytelling) described separately.",
    "- Do NOT write in French; always output English spoken lines.",
    "",
    "Timing constraint (very important):",
    "- The spoken dialogue MUST realistically fit inside the target video duration.",
    "- Keep lines short and easy to say at natural speed.",
    "- For a 15s video: aim around 25–40 spoken words total, max 2–3 short spoken lines.",
    "- Prioritize one strong hook + one key benefit + one short CTA.",
    "- Avoid long technical explanations that cannot be finished in time.",
  ].join("\n");

  const userPrompt = [
    "Create a single UGC video prompt/script (filledPrompt) in ENGLISH, inspired by the style examples and using the context below.",
    "",
    "Template style (high-level):",
    templateStyle,
    "",
    `Target video duration: ${targetDurationSec}s`,
    "Generate a script that can be fully spoken within this duration at normal pace.",
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

