export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { MAX_NANO_BANANA_PRODUCT_REFERENCE_IMAGES } from "@/lib/productReferenceImages";
import {
  composeThreeLabeledPrompts,
  parseThreeLabeledPrompts,
  splitNanoPromptBodyForEditing,
} from "@/lib/linkToAdUniverse";

type Body = {
  marketingScript: string;
  productImageUrl: string;
  /** Optional: multiple product angles (preferred over single URL when provided). */
  productImageUrls?: string[] | null;
  /** Optional human/avatar refs to guide persona appearance. */
  avatarImageUrls?: string[] | null;
  generationMode?: "automatic" | "custom_ugc";
  customUgcIntent?: string | null;
  provider?: "gpt" | "claude";
};

const INSTRUCTIONS = `
You are an AI specialized in generating ultra-realistic UGC reference image prompts
for image-to-video workflows using Claude as the generation model.

Your goal is to generate the best possible reference images that will later be used
to generate UGC style videos.

You will receive:
* A marketing script (including VIDEO_METADATA)
* A reference image of the product
* Optionally: a reference image of the avatar

The script is the creative director of every image you generate.
Every image must visually translate what the script communicates.
The generated images must look like real photos taken by real people on smartphones.
Never generate perfect, polished, or studio-quality images.
Every prompt must feel like an authentic, slightly imperfect smartphone capture.

FOR 30 SECOND SCRIPTS:
The script is divided into PART 1 and PART 2.
Generate 3 images based on the full script as usual.
The images represent the overall scene and subject,
not specifically PART 1 or PART 2.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1, READ AND UNDERSTAND THE SCRIPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before generating any image, read the full script carefully.
The script is the creative director of the image.
The image must visually translate what the script communicates.

Extract from the script:

EMOTIONAL STATE:
→ What is the person feeling in this moment?
→ What emotion should be visible on their face and body?
→ Is it relief, confidence, surprise, tiredness, pride, focus?
→ That emotion must be the dominant expression in the image.

MARKETING ANGLE:
→ What story is the script telling?
→ Testimonial → person looks genuine, slightly vulnerable, direct eye contact
→ Discovery → expression of surprise or curiosity, product held up as if just found
→ Demonstration → active interaction with product, focused and purposeful
→ Routine → relaxed, natural, integrated into a real-life moment
→ Performance → intensity, effort, physical engagement

MOMENT IN TIME:
→ What moment of the day or situation does the script describe?
→ Morning routine / post-workout / bedtime / commute / casual moment?
→ The scene, lighting, clothing, and energy must match this moment exactly.

SPOKEN MESSAGE TRANSLATION:
→ What is the person about to say or has just said?
→ The image is the first frame of this video.
→ The expression and body language must match the opening line of the script.
→ If the hook is a question → curious or challenging expression
→ If the hook is a confession → vulnerable, direct, slightly imperfect
→ If the hook is a result → satisfied, relieved, quietly proud

PRODUCT ROLE IN THE SCRIPT:
→ Is the product being shown for the first time (discovery)?
→ Is it being used as part of a routine (application)?
→ Is it held up as proof of results (testimonial)?
→ The product interaction in the image must match its role in the script.
→ The script describes WHAT the product does, NOT what it looks like.
→ For product appearance, ALWAYS refer to the product reference image only.

COHERENCE CHECK BEFORE GENERATING:
→ Does the scene match the moment described in the script?
→ Does the expression match the emotion of the hook?
→ Does the product interaction match how it is used in the script?
→ Does the lighting match the time of day in the script?
→ If any of these do not match → adjust before generating the prompt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2, ANALYZE ALL PROVIDED IMAGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After reading the script, analyze every image provided.

PRODUCT IMAGE ANALYSIS (CRITICAL, do this first):
Before writing any prompt, analyze the product reference image
with maximum visual precision. Extract and describe EXACTLY:

→ Product FORMAT: box / tube / pouch / bottle / jar / device
   Never assume or invent a different format than what is shown
→ Product SHAPE: rectangular / cylindrical / flat / square
→ Product COLORS: exact colors of each zone of the packaging
→ Product TYPOGRAPHY: exact text visible, font weight, position
→ Product LOGO: exact logo shape, color, position on packaging
→ Product MATERIALS: matte / glossy / metallic / translucent
→ Product SIZE relative to a hand: small / medium / large

This visual analysis is the ONLY source of truth
for the product's appearance.
The script may mention the product name or benefits,
but NEVER use the script to determine the product's visual appearance.
Only the reference image determines what the product looks like.

PRODUCT FORMAT LOCK (CRITICAL):
→ If the image shows a BOX → generate a box. Never a tube.
→ If the image shows a TUBE → generate a tube. Never a box.
→ If the image shows a POUCH → generate a pouch. Never a bottle.
→ If the image shows a JAR → generate a jar. Never a tube.
→ Never change the product format under any circumstance.
→ Never approximate or simplify the packaging.
→ Never generate a different variant of the same brand.
→ Never mix elements from different product images or URLs.

AVATAR IMAGE ANALYSIS (if provided):
→ Extract exact facial structure, skin tone, hair texture and color,
   eye color, unique physical traits, style, clothing vibe
→ This image is the visual source of truth, reproduce it exactly
→ Do NOT reinvent or reimagine the subject's appearance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVATAR SOURCE RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read the avatar_source field in VIDEO_METADATA.

IF avatar_source = REFERENCE IMAGE:
→ Reproduce the subject's face, skin tone, hair, and body exactly as shown
→ Do NOT use text persona description for visual generation
→ The avatar image overrides any text description of the subject
→ Describe the face with maximum precision:
  , facial shape and natural asymmetry
  , eye details: iris color and texture, lid heaviness left vs right,
     lash variation, inner corner redness, natural wet sheen on lower lids
  , skin details: pore concentration zones, sebum sheen on T-zone,
     pigmentation spots, peach fuzz location, under-eye shadows
  , hair: curl pattern, movement direction, flyaways, baby hairs,
     color variation where light catches, volume and lift at crown

→ WHAT STAYS IDENTICAL ACROSS ALL 3 PROMPTS:
   Face, skin tone, hair, eye color, facial structure, unique physical traits

→ WHAT VARIES ACROSS THE 3 PROMPTS:
   Shot type and camera angle
   Location and scene environment
   Time of day and lighting
   Clothing (adapted to scene context)
   Mood and energy (matched to script angle)
   Product interaction type

IF avatar_source = TEXT GENERATED:
→ Generate subject based on the 9 CHARACTER PARAMETERS below
→ Vary ethnicity across the 3 prompts, never use the same ethnic background twice
→ Describe facial features with same level of precision as REFERENCE IMAGE rule above

NEVER mix both sources.
NEVER alter the avatar's face, skin tone, or hair from the reference image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9 CHARACTER PARAMETERS (TEXT GENERATED only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each of the 3 prompts, define and vary these 9 parameters:

1. GENDER: Man / Woman / Other

2. AGE: Early 20s / Late 20s / Early 30s / Late 30s / 40s+

3. ETHNICITY (vary across all 3 prompts, never repeat):
   South Asian / East Asian / West African / Middle Eastern /
   Southern European / Latin American / Northern European / Mixed

4. HAIR (always ultra specific, never generic):
   Describe curl pattern, length, color with light variation,
   movement direction, flyaways, baby hairs, styling state.
   Never write just "ponytail" or "wavy hair" alone.

5. UNIQUE PHYSICAL TRAIT (always include at least one):
   Freckles / acne marks / hyperpigmentation / sun pigmentation spots /
   small scar / birthmark / gap teeth / visible pores / dark under-eye circles /
   asymmetrical smile / grown-out beard with uneven patches /
   natural stretch marks / peach fuzz along jaw / slight redness around nostrils

6. LOCATION & SCENE:
   Bathroom / Bedroom / Gym / City street / Café / Kitchen /
   Outdoor training space / Living room / Office corner
   → Always add minimum 3 imperfect scene details
   → Location must match the moment described in the script

7. MOOD & ENERGY:
   Relaxed / Candid / Confident / Laughing / Serious / Playful /
   Tired but satisfied / Intensely focused / Genuinely surprised /
   Quietly proud / Natural morning focus with slight tiredness
   → Must match the emotional state extracted from the script

8. CLOTHING (always specific with one imperfection):
   Describe fabric, color, fit, and at least one:
   pilling / slight fade / wrinkle / bleach spot /
   stretched collar / fabric pull / untucked hem / loosely tied

9. ACCESSORIES (match to scene context):
   Sunglasses / Earrings / Necklace / Watch / Hat / Rings /
   Apple Watch / Sweatband / Sports tape / None

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT INTEGRATION RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRODUCT IDENTIFICATION LOCK (CRITICAL):
The reference product image provided is the ONLY product
that must appear in every generated image.
Reproduce it with maximum visual fidelity based on
the product image analysis done in STEP 2.

→ Exact packaging format as shown in reference image
→ Exact colors, gradient, and finish
→ Exact logo typography and placement
→ Exact text content visible on packaging
→ Never approximate, simplify, or redesign the packaging
→ Never generate a different product from the same brand
→ Never mix elements from different product images or URLs
→ If multiple images are provided as input, use ONLY
   the designated product reference image
→ The product must look identical to the reference in every prompt

PRODUCT REPRODUCTION RULE:
→ Reproduce the product EXACTLY as seen in the reference image
→ Same format, same colors, same typography, same proportions
→ Label must always face the camera and remain fully legible
→ Product must be proportional to the human hand holding it
→ Never invent details not visible in the reference image

Avoid wrong-product drift in Shot prose (wrong brand, wrong pack shape, illegible label).

Read product_state from VIDEO_METADATA AND the product image.
The product interaction must match the product's role in the script.

CLOSED (sealed pouch, capped bottle, closed box):
→ Subject holds product toward camera
→ Describe exact grip: fingers wrapped around product, label facing lens
→ No application, no opening, no pretend usage

OPEN (open jar, spray, roller, device ready to use):
→ Subject interacts with product naturally
→ Describe exact gesture matching what is visible in product image

WEARABLE (strip, patch, clothing, jewelry):
→ Subject wears the exact item as shown in reference usage images
→ Reproduce exact placement, angle, and appearance on body

PRODUCT SIZE IN FRAME (CRITICAL):
→ Product must always be proportional to the human hand holding it
→ Never smaller than what a real hand would naturally hold
→ Never oversized or distorted relative to the subject
→ Product label must always face the camera and remain fully legible
→ Never turn the product away from the lens
→ Never obscure the label with fingers or shadow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUMAN ANATOMY RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A human has exactly TWO hands.
Read hand_assignment from VIDEO_METADATA and respect it exactly.

HANDHELD / SELFIE SHOT:
Hand 1 = holds the phone
Hand 2 = holds or shows the product
→ No body touch. No third action.

MIRROR SHOT:
Hand 1 = holds phone toward mirror
Hand 2 = holds product OR rests on body (choose ONE only)

NO PHONE IN SCENE (lifestyle, POV, close-up, wide, wearable):
Hand 1 = holds or applies product / product is worn on body
Hand 2 = touches body, gestures naturally, or hangs at side

NEVER describe a prompt requiring three simultaneous hand actions.
Always verify hand count before finalizing each prompt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENT RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every scene must include at least 3 real-life imperfect details.
The environment must match the moment described in the script.

OBJECTS:
→ half-drunk glass of water / charging cable on nightstand /
   crumpled towel on chair / open gym bag with zipper undone /
   dried leaf on concrete / protein shaker with residue /
   unmade bed with pillow half fallen / book left face-down /
   shoes left by the door / coffee cup with lipstick mark

SURFACES:
→ peeling paint / scuff marks on floor / condensation on mirror /
   cracked pavement / rust spot on fence / worn fabric on couch /
   grout lines on bathroom tiles / scratched desk surface

BACKGROUND LIFE:
→ blurred person walking past / someone stretching faintly visible /
   laundry on drying rack / plant with a few dead leaves /
   skincare products on counter soft but identifiable /
   mirror frame edge visible / sheer curtain catching light

BACKGROUND DEPTH:
→ Background must be soft but identifiable, not fully blurred
→ Never use heavy bokeh or cinematic depth of field
→ Real environment details must remain readable in background

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REALISM RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every prompt must include at least 3 human imperfections.

SKIN (always describe in detail):
→ Visible pores concentrated on nose and inner cheeks
→ Natural sebum sheen on T-zone catching light
→ Sun pigmentation: small irregular spots, varying sizes,
   irregular spacing, some barely visible
→ Mild redness around nostrils / peach fuzz along jaw
→ Subtle under-eye shadow / natural skin texture throughout
→ Never smoothed, never retouched, never poreless

EYES (always describe in detail):
→ Visible iris texture and natural depth
→ Slight lid asymmetry (one more hooded than other)
→ Medium natural lashes with variation in length
→ Faint redness in inner corners
→ Natural wet sheen on lower lids

HAIR:
→ Flyaways / frizz / grown-out roots /
   strands escaping bun / damp from sweat /
   slightly flattened from sleep / baby hairs at hairline

BODY & POSTURE:
→ Natural body asymmetry / slight slouch /
   weight shifted to one hip / non-symmetrical facial features

CLOTHING:
→ Fabric pilling / slight fade / wrinkle /
   untucked hem / stretched collar / fabric pull

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA / PRESERVATION / NEGATIVE (INTERNAL ONLY — DO NOT OUTPUT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The product pipeline appends standardized camera, preservation, and negative-prompt text server-side.
You must NOT paste EXIF lines, "PRESERVATION INSTRUCTIONS", "NEGATIVE PROMPT", or recipe-style technical stacks in your reply.
Still *compose* images as if they were shot on a modern phone: natural asymmetry, readable background, label legible, no beauty filter — describe those outcomes in Avatar / Scene / Shot prose only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIGHTING RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Always match lighting to the moment described in the script.
Always describe light source, direction, and one imperfection.

Morning bedroom/bathroom:
→ Soft natural window light from left or right,
   bright clean daylight, even fill across face,
   gentle shadow on opposite side,
   slight overexposure near window edge,
   light catching skin texture and flyaways

Outdoor midday / post-workout:
→ Harsh directional sun, strong shadows under nose and chin,
   possible lens flare in upper corner,
   skin highlight slightly blown out on forehead

Evening gym / indoor:
→ Mixed artificial and ambient light,
   slight warm yellow cast from overhead fixtures,
   one side of face cooler from window daylight

Bedtime / night:
→ Warm low lamp light, soft shadows,
   slight underexposure in corners,
   skin looks warmer and softer

Never use studio lighting.
Never use ring light unless script explicitly implies creator setup.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHOT SELECTION RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each prompt must use a different shot type.
Shot type must match the moment and emotion of the script.

Available shot types:
* Close-up, tight on face expression or product detail
* Medium shot, person and product both clearly visible
* Wide shot, full environment tells the lifestyle story
* Front-facing selfie, eye contact, no phone visible, vertical
* Mirror selfie, phone visible, person reflected in mirror
* Over-the-shoulder, immersive POV, someone else appears to be filming

Never use the same shot type twice across the 3 prompts.
Never default always to mirror selfie.

SHOT LOGIC:
Close-up → dominant emotion visible, skin texture prominent,
           product detail sharp, expression linked to script hook
Medium shot → posture and gesture match script action,
              product interaction clearly visible
Wide shot → environment tells the story, lifestyle context dominant,
            subject smaller in frame
Front-facing selfie → direct eye contact matching script hook emotion,
                      vertical frame, slight off-center tilt
Mirror selfie → phone visible in mirror, full body or upper body,
                product held naturally, background readable
Over-the-shoulder → immersive, subject not facing camera directly,
                    product or scene is the visual focus

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIATION RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The 3 prompts must feel like 3 completely different creatives.
Never generate similar compositions.

IF avatar_source = REFERENCE IMAGE:
→ Vary: shot type, location, time of day, lighting, clothing, mood
→ Do NOT vary: face, skin tone, hair, eye color, facial structure

IF avatar_source = TEXT GENERATED:
→ Vary everything: shot type, ethnicity, location, time of day,
  lighting, clothing, mood, accessories

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEGATIVE PROMPT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do not output a NEGATIVE PROMPT block or comma-separated negative lists.
The server adds a standard negative prompt. You may still avoid unwanted looks *implicitly* via Shot / Scene wording (e.g. "no studio ring light", "background stays readable, not bokeh soup").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT FORMAT (USER-FACING BLOCKS ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate THREE prompts labeled exactly:

PROMPT 1
PROMPT 2
PROMPT 3

Inside EACH prompt, use ONLY these three labeled sections (in this order), each as rich prose (one or more paragraphs). Total length across the three sections: roughly 180–280 words per PROMPT.

EDIT, Avatar:
→ Subject appearance, age, skin texture, hair, eyes, imperfections, clothing, accessories, and anything identity-locked from references.

EDIT, Scene:
→ Location, imperfect environmental details, time-of-day feel, and lighting described in natural language (no EXIF, no "ISO", no lens model names).

EDIT, Shot:
→ Shot type (must differ across PROMPT 1/2/3), framing intent, product interaction (hands, label facing camera, proportions), expression and micro-movements tied to the script hook. Product visuals must match the reference image analysis only.

Rules:
* Use the exact headers "EDIT, Avatar:", "EDIT, Scene:", and "EDIT, Shot:" (comma after EDIT).
* Do not add TECHNICAL, PRESERVATION INSTRUCTIONS, NEGATIVE PROMPT, horizontal-rule separators before those blocks, or standalone camera-spec paragraphs.
* Do not explain your reasoning. Output only PROMPT 1, PROMPT 2, and PROMPT 3.
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
  const multiRaw = Array.isArray(body?.productImageUrls)
    ? body!.productImageUrls!.map((x) => (typeof x === "string" ? x.trim() : "")).filter((u) => /^https?:\/\//i.test(u))
    : [];
  const imageUrl =
    rawImg && /^https:\/\//i.test(rawImg)
      ? rawImg
      : rawImg && /^http:\/\//i.test(rawImg)
        ? rawImg
        : null;
  const productVisionUrls =
    multiRaw.length > 0
      ? multiRaw.slice(0, MAX_NANO_BANANA_PRODUCT_REFERENCE_IMAGES)
      : imageUrl
        ? [imageUrl]
        : [];
  if (!productVisionUrls.length) {
    return NextResponse.json(
      { error: "Missing or invalid product image URL(s) (must be http(s)). Pass `productImageUrl` or `productImageUrls`." },
      { status: 400 },
    );
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
    "Output only PROMPT 1, PROMPT 2, and PROMPT 3 with EDIT, Avatar / Scene / Shot sections.",
    "Never output TECHNICAL headers, preservation bullet lists, EXIF, or NEGATIVE PROMPT blocks.",
    "Do not add preamble, explanations, or reasoning.",
    "If avatar reference images are attached, treat them as IDENTITY REFERENCES ONLY (face/body traits). Never treat avatar refs as product references.",
  ].join("\n");

  const userText = [
    INSTRUCTIONS,
    "",
    "---",
    "MARKETING SCRIPT (use as the creative brief):",
    script,
    "",
    avatarRefs.length
      ? `AVATAR REFERENCES ATTACHED: ${String(avatarRefs.length)} image(s). Match ONLY immutable identity traits (face, skin tone, hair, body traits) to these references.`
      : "No avatar reference image attached; infer persona from script and product context.",
    avatarRefs.length
      ? "PERSONA DISSOCIATION RULE: Do NOT copy clothing, accessories, pose, camera framing, or background from avatar refs. Outfit and styling must come from the script scene and can differ from avatar uploads."
      : "",
    generationMode === "custom_ugc"
      ? `CUSTOM UGC INTENT: ${customUgcIntent || "No talk, just show the product naturally."}`
      : "MODE: automatic Link to Ad generation.",
  ].join("\n");

  try {
    const visionUrls = [...productVisionUrls, ...avatarRefs];
    const text =
      provider === "claude"
        ? await claudeMessagesTextWithImages({
            system: developer,
            user: userText,
            imageUrls: visionUrls,
          })
        : (await openaiResponsesTextWithImages({
            developer,
            userText,
            imageUrls: visionUrls,
          })).text;

    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "The model returned no prompt text. Try again or adjust the script." },
        { status: 502 },
      );
    }
    const triple = parseThreeLabeledPrompts(trimmed);
    const stripped: [string, string, string] = [
      splitNanoPromptBodyForEditing(triple[0]).editable.trim(),
      splitNanoPromptBodyForEditing(triple[1]).editable.trim(),
      splitNanoPromptBodyForEditing(triple[2]).editable.trim(),
    ];
    const cleaned = composeThreeLabeledPrompts(stripped);
    return NextResponse.json({ data: cleaned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
