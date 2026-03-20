export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  /** Full UGC script for the chosen angle (includes VOICE PROFILE etc.) */
  angleScript: string;
};

const INSTRUCTIONS = `
GPT PROMPT VIDEO — UGC AI Video Prompt Engine (Image-to-Video)

Purpose
• Convert a UGC script + reference image context into a stable AI video prompt.
• Keep the video fully consistent with the reference image (first frame).
• Add structured motion: gestures, facial expression, speech, camera behavior.
• Optimize for image-to-video models such as VEO and Kling.

Core principle (image-to-video)
• Do NOT recreate the scene. Environment, subject and composition already exist in the reference image.
• Only describe movement, gestures, speech delivery, and camera behavior.

Motion layering (conceptual order while writing — do not output these as labels)
1. Camera setup
2. Subject movement
3. Product interaction
4. Facial expressions and micro movements
5. Speech delivery
6. Visual realism and consistency anchors

Stability anchors (weave into prose)
• The scene remains consistent with the input/reference image.
• No new objects appear.
• The subject remains identical to the reference image.
• Lighting and environment remain unchanged.

UGC realism anchors
• realistic skin texture
• natural lighting
• authentic smartphone camera realism
• slight handheld camera movement
• authentic UGC style

Micro movements for human realism
• natural blinking
• subtle head movement
• small hand adjustments
• natural breathing motion

Common UGC camera shots (choose what matches the script; do not ask the user)
• Selfie shot (smartphone front camera)
• Medium shot (torso and face visible)
• Close-up (face or product focus)
• POV (user perspective)
• Over-the-shoulder

Common UGC camera motion
• slight handheld shake
• subtle framing adjustments
• small natural camera drift

Five core UGC video formats (auto-detect from script; never ask the user)
Selfie testimonial · POV demo · Mirror review · Casual recommendation · Product reaction

Automatic format detection
• Infer the best format from tone, intent, and speech structure.
Example hints: personal experience → selfie testimonial; product explanation → POV demo;
reaction or transformation → product reaction.

Voice profile integration (from the script text you receive)
• Voice signature: gender, age, accent, timbre.
• Voice performance: tone, pacing, emotion, energy.
• Spoken delivery in the video prompt must match that profile.

Gesture mapping (match speech intent; avoid static characters)
• Confidence statement → slight nod + optional small hand gesture
• Showing product → raise product toward camera + gentle rotate if natural
• Explanation → subtle hand movement + slight lean toward camera

Internal checklist (do not print as headings): camera setup / subject action / product interaction /
facial expression / speech delivery with exact dialogue / visual style / anchors.

Output rules (CRITICAL)
Generate ONE compact UGC video prompt as plain text.

Structure the content mentally in this order (no section titles in output):
1. Camera shot description (1 sentence)
2. Character presence and actions (2–3 sentences)
3. Natural human micro movements (1 sentence)
4. Dialogue: full script lines the talent speaks, in one block (quoted or clearly marked as speech)
5. Visual realism style (brief)
6. Scene consistency anchors (brief)

Write as one continuous cinematic description.
Group character actions before the dialogue block.
Keep between 120 and 180 words.
Avoid long segmented or bullet-style prompts; prefer compact grouped actions.
Do not repeat what is already obvious from the reference image.
Only describe movements, gestures, and expressions that occur during the clip.

Example style (illustrative only — adapt to the actual script):
Handheld selfie shot, smartphone front camera, slight handheld movement. The scene remains consistent with the reference image. The person raises the product toward the camera and gently rotates it. They nod slightly while speaking, confident expression with natural blinking. They say in a calm conversational tone: "I swear this fixed my beard gaps." Realistic skin texture, natural lighting, authentic smartphone UGC style. All elements stay consistent with the reference image.
`.trim();

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const angleScript = body?.angleScript?.trim();
  if (!angleScript) {
    return NextResponse.json({ error: "Missing `angleScript`." }, { status: 400 });
  }

  const developer = [
    "You output a single compact image-to-video prompt as plain text.",
    "No section headings in the output. One continuous cinematic description.",
    "Follow every rule in the GPT PROMPT VIDEO block in the user message.",
  ].join("\n");

  const user = [
    INSTRUCTIONS,
    "",
    "---",
    "UGC SCRIPT FOR THIS ANGLE (includes voice profile — use it):",
    angleScript,
  ].join("\n");

  try {
    const { text } = await openaiResponsesText({ developer, user });
    return NextResponse.json({ data: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
