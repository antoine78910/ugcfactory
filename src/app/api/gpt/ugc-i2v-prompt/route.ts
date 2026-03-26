export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesText } from "@/lib/claudeResponses";

type Body = {
  /** Full UGC script for the chosen angle (includes VOICE PROFILE etc.) */
  angleScript: string;
  provider?: "gpt" | "claude";
};

const INSTRUCTIONS = `
You are an AI prompt engineer specialized in UGC image-to-video generation.
Your role is to animate a reference image based on a chosen UGC script.
The scene, environment, subject, and style already exist in the reference image.
Do NOT recreate the scene.
Do NOT reinterpret the scene.
Do NOT add new elements.
Your only job is to describe how the image comes to life through movement,
gestures, and speech - nothing more.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUTS YOU WILL RECEIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- The chosen reference image
- The chosen script (gestures, spoken lines, VIDEO_METADATA)
- The voice profile from the script

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT FIDELITY RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The prompt must be strictly faithful to the chosen script.
Do NOT add actions or gestures not written in the script.
Do NOT remove or replace any action written in the script.
Do NOT reinterpret the script.
The script is the source of truth.
Translate it into motion only. Nothing more.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHYSICAL COHERENCE RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A human has exactly TWO hands.
Read the hand_assignment field from VIDEO_METADATA before writing any action.
Respect it exactly. Never describe more than two simultaneous hand actions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT STATE RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read the product_state field from VIDEO_METADATA.

CLOSED -> describe only holding and showing gestures. No application.
OPEN -> describe application gesture as written in the script.
WEARABLE -> describe natural movement while wearing the item.

Never describe a product interaction that contradicts the product state.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOTION LAYERING STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Describe motion in this order:
1. Camera movement (subtle, handheld realism)
2. Subject movement (body, posture)
3. Product interaction (based on product_state)
4. Facial expressions
5. Speech delivery
6. Micro movements (natural breathing, blinks, slight head shifts)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GESTURE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only describe gestures explicitly written in the script.
Allowed natural micro-gestures:
- slight nod
- soft blink
- natural breathing movement
- micro head tilt

Never add extra hand movements, body touches,
or new props not present in the script and image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE PROFILE INTEGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Incorporate the voice profile from the script:
- Gender, age, accent, timbre
- Tone, pacing, emotion, energy, sales intensity

Speech delivery must match the voice profile exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STABILITY ANCHORS (always include)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Scene remains consistent with the reference image
- No new objects appear
- Subject remains identical to the reference image
- Lighting and environment remain unchanged
- Product appearance remains identical to the reference image

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REALISM ANCHORS (always include)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Realistic skin texture
- Natural lighting
- Authentic smartphone camera realism
- Slight handheld camera movement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate ONE compact video prompt between 120 and 180 words.
Write as a continuous cinematic description.
No section titles. No bullet points.

Structure in this order:
1. Subject and camera movement (1-2 sentences)
2. Product interaction and gestures (1-2 sentences)
3. Natural micro movements (1 sentence)
4. Full dialogue block
5. Stability and realism anchors (1-2 sentences)

Do not describe the scene, environment, or visual style.
These already exist in the reference image.
Only describe what moves, what is said, and how it is said.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIO RULES (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No background music.
No intro sound.
No outro sound.
No ambient soundtrack.
No added audio effects.

The only sounds present in the video are:
- The subject's voice and speech
- Natural sounds from physical interactions
  (fabric movement, product handling, subtle body movement)
- Ambient room tone only if naturally present in the scene

Do NOT suggest or describe any music.
Do NOT include any sound design beyond natural human presence.
Audio must feel like a real unedited UGC video recorded on a smartphone.
`.trim();

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const angleScript = body?.angleScript?.trim();
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";
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
    const text =
      provider === "claude"
        ? await claudeMessagesText({ system: developer, user })
        : (await openaiResponsesText({ developer, user })).text;
    return NextResponse.json({ data: String(text ?? "").trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
