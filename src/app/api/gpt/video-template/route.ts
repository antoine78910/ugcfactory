export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";

type TemplateId = "template1" | "template2" | "template3";

type Body = {
  url: string;
  analysis: unknown;
  quiz: Record<string, unknown>;
  templateId: TemplateId;
  productName?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url || !body.analysis || !body.quiz || !body.templateId) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const template = (() => {
    switch (body.templateId) {
      case "template1":
        return `TEMPLATE 1 — UGC SMARTPHONE AUTHENTIQUE (POV / SELFIE)
Handheld, front-facing smartphone shot.
Slight natural shake, authentic phone camera vibe.
Eye-level angle.
Natural daylight coming from a nearby window.
Background: {location_type}, slightly lived-in but realistic.

A {persona_age} {persona_gender} wearing {outfit_style}.
Natural skin texture, realistic details, no heavy smoothing.

At the beginning, {character_action_before_speaking}.

With a {emotion_tone} tone, they say:

“{hook_line}”

They slightly move closer to the camera, maintaining eye contact.
They lift {product_name} naturally toward the lens. The logo is visible but not forced.
They continue speaking naturally:

“{problem_statement}”

While saying this, they {gesture_linked_to_problem}.

They shift tone slightly, more confident:
“{key_benefit_1}. {key_benefit_2}.”
They demonstrate physically by {gesture_linked_to_benefit}.

Very subtle micro push-in camera movement.
They finish with a relaxed smile:
“{cta_line}”

No subtitles. No music. Natural ambient sound only.`;
      case "template2":
        return `TEMPLATE 2 — BEAUTY / WELLNESS CINEMATIC UGC
Medium close-up, eye-level.
Soft natural daylight from a side window.
Shallow depth of field isolating the subject.
Warm neutral color palette.
Background: clean {location_type}, minimal and elegant.

A {persona_age} {persona_gender} with natural skin texture and subtle imperfections visible. Wearing {outfit_style}.

At the start, they {subtle_expressive_movement}. Small facial expression matching {emotion_tone}.
They say softly:
“{hook_line}”

Brief pause.
They continue, sincere tone:
“{problem_statement}”
They gently touch {face_or_body_area} while speaking.

They pick up {product_name}, holding it at chest level. The logo faces the camera naturally.
They say:
“{key_benefit_1}. {key_benefit_2}. {key_benefit_3}.”

While explaining, they demonstrate physically:
{physical_demonstration_of_product}.

Very subtle dolly-in.
They end with calm confidence:
“{cta_line}”

Realistic texture, no blur filter. No subtitles. No music. Soft natural ambience.`;
      case "template3":
        return `TEMPLATE 3 — STORYTELLING / PROBLEM-SOLUTION UGC
Medium shot, eye-level.
Subtle handheld realism.
Lighting: {lighting_type} (morning soft daylight / warm bedside lamp / neutral indoor light).
Background: {location_type}, realistic and relatable.

A {persona_age} {persona_gender} sitting naturally. Wearing {outfit_style}.
Natural skin detail, no perfection filter.

They take a small breath before speaking. Their posture shows {emotion_tone}.
They say:
“{hook_line}”

Short pause. Eye contact steady.
They continue, honest tone:
“{problem_statement}”
They physically demonstrate the problem by {gesture_linked_to_problem}.

They slowly pick up {product_name}. The movement is deliberate and calm.
They say:
“{discovery_line}”

They demonstrate the product:
{physical_product_usage}.

Close-up moment on the product briefly.
They look back at the camera, relief visible:
“{result_statement}”

Small exhale or soft smile.
They finish naturally:
“{cta_line}”

No subtitles. No music. Natural ambience only.`;
    }
  })();

  const developer = [
    "You are a UGC scriptwriter and prompt engineer for video generation models.",
    "Fill the chosen template placeholders using ONLY the given analysis + quiz.",
    "Return STRICT JSON only.",
    "Keep the script natural, credible, non-hypey. Avoid unverifiable claims; stay aligned with the page claims.",
    "Output: { filledPrompt, filledFields, recommendedTemplateReason }",
  ].join("\n");

  const user = [
    "Fill this template for a UGC video.",
    "",
    "Template:",
    template,
    "",
    "Context JSON:",
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
    const { text } = await openaiResponsesText({ developer, user });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        filledPrompt: String(parsed?.filledPrompt ?? ""),
        filledFields: parsed?.filledFields ?? {},
        recommendedTemplateReason: String(parsed?.recommendedTemplateReason ?? ""),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

