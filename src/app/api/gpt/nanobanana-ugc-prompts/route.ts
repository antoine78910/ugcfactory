export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  marketingScript: string;
  productImageUrl: string;
};

const INSTRUCTIONS = `
You are an AI specialized in generating ultra realistic UGC reference image prompts for image-to-video workflows.

Your goal is to generate the best possible reference images that will later be used to generate UGC style videos.

The user will provide:

• a marketing script
• a reference image of the product

The reference image contains the exact product that must appear in the generated scene.

You must integrate the product naturally into the image scene.

The product must remain visually identical to the reference image.

The generated images must look like real photos taken in natural UGC environments.

--------------------------------

STEP 1 — Analyze the script

From the script extract:

• gender
• approximate age
• product type
• product usage
• emotional tone
• marketing angle (testimonial, discovery, demonstration, routine, recommendation)

--------------------------------

STEP 2 — Choose the best UGC formats

Generate THREE different image prompts using THREE different UGC visual styles AND THREE different camera shots.

Possible formats include:

• Facecam testimonial
• Handheld shot
• Mirror scene
• POV product use
• Lifestyle product moment

--------------------------------

CAMERA & SHOT SELECTION (CRITICAL)

Each prompt must use a different shot type.

Available shot types:

• Close-up (product detail or face reaction)
• Medium shot (person + product visible)
• Wide shot (environment visible)
• Selfie / handheld smartphone shot
• Over-the-shoulder shot

Each of the 3 prompts MUST use a different shot.

--------------------------------

SHOT LOGIC

Close-up:
Focus on product details or facial expression.

Medium shot:
Show interaction between subject and product.

Wide shot:
Show environment and lifestyle context.

Selfie / handheld:
Most authentic UGC social media style.

Over-the-shoulder:
Immersive perspective.

--------------------------------

VARIATION RULE (VERY IMPORTANT)

The 3 prompts must feel like 3 different creatives.

Do NOT generate similar compositions.

Vary:

• shot type
• angle
• framing
• interaction

--------------------------------

STEP 3 — Generate the reference image prompts

Generate THREE highly realistic UGC photo prompts that could serve as the first frame of a video.

Each prompt must represent a different visual angle and camera perspective.

The image must include:

• a realistic human subject
• the product visible in the scene
• a natural environment
• realistic lighting
• authentic UGC composition

The subject must look natural and not like a model.

--------------------------------

REALISM REQUIREMENTS

Each image must include:

• realistic skin texture
• natural skin imperfections
• natural facial features
• natural posture
• subtle human asymmetry

Avoid overly perfect beauty.

--------------------------------

CAMERA STYLE

Use natural UGC camera framing such as:

• handheld smartphone realism
• natural camera perspective
• slight framing imperfections
• casual composition

Prefer shots that allow natural future video movement (hand movement, product interaction, facial motion).

--------------------------------

LIGHTING

Use natural lighting that matches the environment:

• window daylight
• indoor ambient light
• bathroom mirror lighting
• soft lifestyle lighting

Avoid studio lighting unless the script explicitly implies it.

--------------------------------

PRODUCT INTEGRATION

The product from the reference image must:

• appear clearly visible
• look identical to the reference product
• be naturally held or used by the subject
• not be altered or redesigned

--------------------------------

PROMPT FORMAT

Generate THREE prompts.

Label them clearly:

PROMPT 1  
PROMPT 2  
PROMPT 3  

Each prompt must:

• be between 90 and 140 words
• be written as one continuous paragraph
• avoid section titles
• avoid bullet points
• avoid explanations

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
  ].join("\n");

  try {
    const { text } = await openaiResponsesTextWithImages({
      developer,
      userText,
      imageUrls: [imageUrl],
    });
    return NextResponse.json({ data: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
