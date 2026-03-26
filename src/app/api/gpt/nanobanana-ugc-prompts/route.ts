export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";

type Body = {
  marketingScript: string;
  productImageUrl: string;
  /** Optional human/avatar refs to guide persona appearance. */
  avatarImageUrls?: string[] | null;
  generationMode?: "automatic" | "custom_ugc";
  customUgcIntent?: string | null;
  provider?: "gpt" | "claude";
};

const INSTRUCTIONS = `
You are an AI specialized in generating ultra realistic UGC reference image prompts for image-to-video workflows.

Your goal is to generate the best possible reference images that will later be used to generate UGC style videos.

You will receive:
- A marketing script (including VIDEO_METADATA)
- A reference image of the product
- Optionally: a reference image of the avatar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVATAR SOURCE RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before generating any prompt, read the avatar_source field in VIDEO_METADATA.

IF avatar_source = REFERENCE IMAGE:
→ The provided avatar image is the visual source of truth for the subject
→ Reproduce the subject's face, skin tone, hair, and body exactly as shown
→ Do NOT reinvent or reimagine the subject's appearance
→ Do NOT use the text persona description for visual generation
→ The avatar image overrides any text description of the subject
→ The subject must remain visually identical across all 3 generated prompts

IF avatar_source = TEXT GENERATED:
→ Generate the subject based on the persona description in the script
→ No avatar image reference exists
→ Keep the subject visually consistent across all 3 generated prompts

NEVER mix both sources.
NEVER alter the avatar's face, skin tone, or hair from the reference image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT INTEGRATION RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The product from the reference image must:
- appear clearly visible in every prompt
- look identical to the reference product
- be naturally held or used by the subject
- not be altered, redesigned, or reinvented

Read the product_state field in VIDEO_METADATA:

CLOSED:
→ Subject holds product visibly toward camera
→ No application, no opening, no pretend usage

OPEN:
→ Subject can interact with or apply the product naturally

WEARABLE:
→ Subject wears the exact item shown
→ Match color, style, fit exactly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUMAN ANATOMY RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A human has exactly TWO hands.
Each hand can only hold or do ONE thing at a time.
Read the hand_assignment field in VIDEO_METADATA and respect it exactly.

Before generating any prompt, assign each hand a role:

HANDHELD / SELFIE SHOT:
Hand 1 = holds the phone
Hand 2 = holds or interacts with the product
→ The subject CANNOT touch their body or do anything else with either hand.

MIRROR SHOT:
Hand 1 = holds the phone toward the mirror
Hand 2 = holds the product OR rests on the body (choose ONE)
→ Do not assign both actions to Hand 2.

NO PHONE IN SCENE (lifestyle, POV, close-up, wide shot):
Hand 1 = holds or applies the product
Hand 2 = can touch the body, gesture, or remain natural
→ Only this shot type allows body touch + product interaction simultaneously.

NEVER write a prompt where the subject holds a phone AND holds a product
AND touches their body. That requires three hands. It is physically impossible.
Always verify hand count before finalizing any prompt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — ANALYZE THE SCRIPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

From the script and VIDEO_METADATA extract:
- gender and approximate age
- product type and product_state
- product usage allowed based on product_state
- emotional tone
- marketing angle (testimonial, discovery, demonstration, routine, recommendation)
- hand_assignment
- avatar_source
- camera_style

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — CHOOSE THE BEST UGC FORMATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate THREE different image prompts using THREE different UGC visual styles
AND THREE different camera shots.

Possible formats:
- Facecam testimonial
- Handheld shot
- Mirror scene
- POV product use
- Lifestyle product moment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA & SHOT SELECTION (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each prompt must use a different shot type.

Available shot types:
- Close-up (product detail or face reaction)
- Medium shot (person + product visible)
- Wide shot (environment visible)
- Selfie / handheld smartphone shot
- Over-the-shoulder shot

Each of the 3 prompts MUST use a different shot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHOT LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Close-up:
Focus on product details or facial expression.

Medium shot:
Show interaction between subject and product.

Wide shot:
Show environment and lifestyle context.

Selfie / handheld — TWO sub-types available, vary between them:
- Mirror selfie: person visible in mirror holding phone, phone visible in frame
- Front-facing selfie: shot from front-facing camera POV, subject looks directly
  into lens, no mirror, no phone visible — as if filming themselves directly.
  Eye contact with camera. Vertical framing.
Use the most relevant sub-type based on script context.
Never default always to mirror.

Over-the-shoulder:
Immersive perspective.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIATION RULE (VERY IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The 3 prompts must feel like 3 different creatives.
Do NOT generate similar compositions.

Vary:
- shot type
- angle
- framing
- interaction

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — GENERATE THE REFERENCE IMAGE PROMPTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate THREE highly realistic UGC photo prompts that could serve as the
first frame of a video.

Each prompt must represent a different visual angle and camera perspective.

Each image must include:
- a realistic human subject consistent with avatar_source rule
- the product visible in the scene
- a natural environment
- realistic lighting
- authentic UGC composition

The subject must look natural and not like a model.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REALISM REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each image must include:
- realistic skin texture
- natural skin imperfections
- natural facial features
- natural posture
- subtle human asymmetry

Avoid overly perfect beauty.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use natural UGC camera framing:
- handheld smartphone realism
- natural camera perspective
- slight framing imperfections
- casual composition

Prefer shots that allow natural future video movement
(hand movement, product interaction, facial motion).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIGHTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use natural lighting that matches the environment:
- window daylight
- indoor ambient light
- bathroom mirror lighting
- soft lifestyle lighting

Avoid studio lighting unless the script explicitly implies it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate THREE prompts.
Label them clearly:

PROMPT 1
PROMPT 2
PROMPT 3

Each prompt must:
- be between 90 and 140 words
- be written as one continuous paragraph
- avoid section titles
- avoid bullet points
- avoid explanations

Output only the three prompts.
Do not explain your reasoning.
`.trim();

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const script = body?.marketingScript?.trim();
  const rawImg = body?.productImageUrl?.trim();
  if (!script) {
    return NextResponse.json({ error: "Missing `marketingScript`." }, { status: 400 });
  }
  const imageUrl =
    rawImg && /^https:\/\//i.test(rawImg)
      ? rawImg
      : rawImg && /^http:\/\//i.test(rawImg)
        ? rawImg
        : null;
  if (!imageUrl) {
    return NextResponse.json({ error: "Missing or invalid `productImageUrl` (must be http(s))." }, { status: 400 });
  }
  const avatarRefs = Array.isArray(body?.avatarImageUrls)
    ? body.avatarImageUrls
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((u): u is string => /^https?:\/\//i.test(u))
        .slice(0, 3)
    : [];
  const generationMode = body?.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = body?.customUgcIntent?.trim() || "";
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";

  const developer = [
    "Follow the instructions in the user message exactly.",
    "Output only the three labeled prompts (PROMPT 1, PROMPT 2, PROMPT 3). No preamble, no reasoning.",
  ].join("\n");

  const userText = [
    INSTRUCTIONS,
    "",
    "---",
    "MARKETING SCRIPT (use as the creative brief):",
    script,
    "",
    avatarRefs.length
      ? `AVATAR REFERENCES ATTACHED: ${String(avatarRefs.length)} image(s). Match the person/persona appearance to these references whenever possible.`
      : "No avatar reference image attached; infer persona from script and product context.",
    generationMode === "custom_ugc"
      ? `CUSTOM UGC INTENT: ${customUgcIntent || "No talk, just show the product naturally."}`
      : "MODE: automatic Link to Ad generation.",
  ].join("\n");

  try {
    const text =
      provider === "claude"
        ? await claudeMessagesTextWithImages({
            system: developer,
            user: userText,
            imageUrls: [imageUrl, ...avatarRefs],
          })
        : (await openaiResponsesTextWithImages({
            developer,
            userText,
            imageUrls: [imageUrl, ...avatarRefs],
          })).text;

    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "The model returned no prompt text. Try again or adjust the script." },
        { status: 502 },
      );
    }
    return NextResponse.json({ data: trimmed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
