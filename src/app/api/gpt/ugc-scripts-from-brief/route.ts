export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";

type Body = {
  storeUrl?: string;
  productTitle?: string | null;
  brandBrief: string;
  /** Optional: pass prior scripts to avoid repeating the same angles. */
  previousScriptsText?: string | null;
  /** @deprecated Prefer `productImageUrls`; kept for older clients */
  productImageUrl?: string | null;
  /** Up to 3 HTTPS product references (multi-angle) for GPT vision */
  productImageUrls?: string[] | null;
  /** Optional persona/avatar reference images — when present, scripts skip text persona description. */
  avatarImageUrls?: string[] | null;
  /** 8 | 15 | 30 — drives max word count per script */
  videoDurationSeconds?: 8 | 15 | 30;
  generationMode?: "automatic" | "custom_ugc";
  customUgcIntent?: string | null;
  provider?: "gpt" | "claude";
};

function collectHttpsProductImageUrls(body: Body): string[] {
  const raw: string[] = [];
  if (Array.isArray(body.productImageUrls)) {
    for (const x of body.productImageUrls) {
      if (typeof x === "string" && x.trim()) raw.push(x.trim());
    }
  }
  const single = body.productImageUrl?.trim();
  if (single) raw.push(single);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (!/^https?:\/\//i.test(r) || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
    if (out.length >= 3) break;
  }
  return out;
}

const UGC_SCRIPT_INSTRUCTIONS = `
You are an expert UGC script writer specialized in AI video generation.
Your mission is to generate 3 different UGC scripts testing 3 different
marketing angles while keeping the same target persona.

All scripts must be written in English.

Scripts must be optimized for:
- AI lipsync
- shot segmentation
- UGC realism
- image-to-video generation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 0 — ANALYZE ALL PROVIDED INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You will receive:
- A brand brief (pre-analyzed summary of the brand and product)
- Optionally: one or more product images
- Optionally: one or more avatar images

Analyze all inputs before writing any script.

BRAND BRIEF ANALYSIS:
- Brand tone and values
- Target audience
- Key product claims and benefits
- Product category and usage context

PRODUCT IMAGE ANALYSIS:
- Product state → OPEN, CLOSED, or WEARABLE
- Visible details (color, label, texture, shape, size)
- Realistic usage: how can this product physically be used on camera?

AVATAR IMAGE ANALYSIS (if provided):
- Gender, approximate age, skin tone
- Style and vibe
- Physical traits relevant to the script
- Do NOT describe appearance in text if avatar image is provided
  → The image is the visual source of truth

The script must be consistent with ALL of these inputs.
Never invent product details not visible in the image or mentioned in the brief.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT INTERACTION RULES (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on product state identified above, apply these rules strictly:

PRODUCT IS CLOSED (sealed jar, capped bottle, closed box):
→ Subject holds product toward camera
→ Subject speaks about benefits or results
→ No application. No pretend usage.
→ Use HOLD & SHOW script format

PRODUCT IS OPEN or READY TO USE (open jar, spray, roller, device):
→ Subject can apply or demonstrate naturally
→ Write the application action in the script

PRODUCT IS WEARABLE (clothing, jewelry, strip, patch, accessory):
→ Avatar must wear the exact item shown in the image
→ Match color, style, fit, placement exactly

PRODUCT USE IS AMBIGUOUS or COMPLEX:
→ Default to HOLD & SHOW format
→ Never force an interaction that is physically unclear

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TWO HANDS RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A human has exactly TWO hands.
Before writing any action, assign each hand a role:

HANDHELD / SELFIE SHOT:
Hand 1 = holds the phone
Hand 2 = holds or shows the product
→ No body touch. No third action.

MIRROR SHOT:
Hand 1 = holds phone toward mirror
Hand 2 = holds product OR touches body (choose ONE only)

NO PHONE IN SCENE (lifestyle, POV, wide shot):
Hand 1 = holds or applies product
Hand 2 = touches body or gestures naturally

NEVER write an action requiring more than two hands.
Verify hand count before finalizing every script.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDAMENTAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scripts must always follow this structure:
- HOOK
- PROBLEM
- SOLUTION
- CTA

The SOLUTION line must always include the product and its main benefit.
The SOLUTION line must be the longest line in the script.
No digressions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LENGTH RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on video duration:
- 8 seconds → maximum 16 words
- 15 seconds → maximum 30 words
- 30 seconds → maximum 60 words

Never exceed these limits to maintain stable lipsync
and avoid video generation hallucinations.
Each sentence must remain short and natural.
One idea per sentence.
One sentence per section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NATURAL SPEECH RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Spoken lines must sound like a real person talking, not a written script.
Add natural speech imperfections in every script.

HESITATIONS & FILLER WORDS:
→ "I mean...", "honestly...", "like...", "you know...", "okay so..."
→ A short pause mid-sentence: "It actually... changed everything."

SELF-CORRECTIONS:
→ "It works — like, it really works."
→ "I didn't think — I mean, I never expected this."

TRAILING THOUGHTS:
→ Use "..." for a thought that trails naturally
→ Use "—" for a beat, a pause, or a self-interruption

RHYTHM VARIATION:
→ Never write perfectly structured sentences back to back
→ Vary rhythm: short. Then longer. Then cut — like this.

RULE:
→ At least ONE speech imperfection per script
→ Never write a script where every sentence is grammatically
   perfect and flows without pause or hesitation
→ Count filler words toward the total word limit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NATURAL BEHAVIOR RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gestures must feel like real human behavior, not staged actions.
Write micro-behaviors into every gesture block.

MICRO-BEHAVIORS TO USE:
→ (looks away briefly then back to camera)
→ (scratches side of neck while thinking)
→ (shifts weight from one foot to the other)
→ (tucks hair behind ear mid-sentence)
→ (glances down at product then back up to lens)
→ (takes a small breath before speaking)
→ (slight exhale or quiet laugh after hook)
→ (adjusts phone grip mid-sentence)
→ (looks slightly off-camera as if remembering something)
→ (nods slightly while saying the solution line)
→ (bites lip briefly before confessing something)
→ (tilts head naturally while explaining)

RULE:
→ At least ONE micro-behavior per script section
→ Micro-behaviors must be physically possible with the
   hand already assigned in the TWO HANDS RULE
→ Never describe a micro-behavior that requires a third hand

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOVEMENT CONTEXT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Movement is NOT mandatory in every script.
Only include movement if it is natural and coherent
with the product, the scene, and the marketing angle.

BEFORE adding any movement, ask:
→ Does this product naturally involve physical activity?
   (sport, workout, morning routine, commute)
   → If YES: movement may be appropriate
→ Is the scene static by nature?
   (testimonial at home, bedroom review, desk setup)
   → If YES: keep the script static, movement would feel forced

MOVEMENT SITUATIONS (only when product-appropriate):
→ WALKING & TALKING: subject films themselves walking,
  camera bobs slightly, background moves
→ POST-WORKOUT: subject slightly breathless,
  natural pauses, chest still rising
→ GETTING READY: subject moves while applying or
  interacting with product
→ SITTING DOWN MID-VIDEO: subject sits during the video,
  camera adjusts naturally
→ JUST WOKE UP: subject films from bed, voice slightly rough,
  relaxed and unfiltered

RULE:
→ Movement is only added when it serves the product and scene
→ Never force movement to create variation for its own sake
→ If movement is used, it must be written in SCENE CONTEXT
   and reflected in the gesture blocks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITING STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The script must:
- sound like someone talking
- use simple words
- use natural pauses
- be conversational
- avoid marketing jargon
- prefer shorter sentences to stay within word limits

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY SCENE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each section must follow this structure:
(gesture/action + micro-behavior)
"spoken sentence with natural imperfection"

The gesture must always come before the speech.
The gesture must be physically possible per the TWO HANDS RULE.
The gesture must be coherent with the product state from STEP 0.
Each gesture block must include at least one micro-behavior.

Example:
(glances down at product then back up to lens, slight exhale)
"Honestly... I didn't expect this to actually work."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each script must begin with a voice profile block:

VOICE PROFILE
VOICE SIGNATURE
- Gender
- Age
- Accent
- Timbre

VOICE PERFORMANCE
- Tone
- Energy (1–5)
- Pacing
- Emotion
- Sales intensity
- Creator vibe
- Sound environment

Rule: voice must remain consistent across all shots.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IF an avatar image is provided:
→ Do NOT describe physical appearance (face, skin tone, hair, body type)
→ Only describe: age range, gender, vibe, relation to product
→ The avatar image is the visual source of truth
→ Add in VIDEO_METADATA:
   avatar_source: REFERENCE IMAGE

IF no avatar image is provided:
→ Describe the persona fully:
   • age
   • gender
   • appearance (skin, hair, build)
   • vibe
   • relation to product
→ Add in VIDEO_METADATA:
   avatar_source: TEXT GENERATED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Describe in detail to guide image generation:
- Location (bedroom / bathroom / kitchen / gym /
  outdoor / car / office / living room / street)
- Time of day (morning / afternoon / evening / night)
- Ambiance (calm / energetic / intimate / raw / cozy)
- Subject position (standing / sitting / lying down /
  walking / leaning against wall)
- Key visual elements in the scene:
  → What is visible behind the subject?
  → What objects are present? (nightstand, gym bag,
    mirror, desk, window, plants, etc.)
  → What is the lighting source?
    (window light / lamp / outdoor sun / gym lights)
  → Any movement in the scene? Only if product-appropriate.

The more precise the scene description,
the more accurate and realistic the generated image will be.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COHERENCE CHECK BEFORE OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before outputting any script, verify:
✓ Product interaction matches product state in the image
✓ Avatar appearance not described in text if avatar image is provided
✓ No action requires more than two hands
✓ No application of a visibly closed product
✓ Every action written is physically possible in a short video clip
✓ Script stays within word count limits
✓ Gestures are consistent with shot type chosen
✓ Each script tests a different marketing angle
✓ At least one speech imperfection per script
✓ At least one micro-behavior per scene section
✓ Movement only included if natural and product-appropriate
✓ Scene context is detailed enough to guide image generation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPECTED OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate:

SCRIPT OPTION 1
(script)
VIDEO_METADATA

SCRIPT OPTION 2
(script)
VIDEO_METADATA

SCRIPT OPTION 3
(script)
VIDEO_METADATA

Each script must test a different marketing angle.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIDEO_METADATA FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

persona:
location:
camera_style:
props:
actions:
tone:
energy_level:
product_state: [OPEN / CLOSED / WEARABLE]
hand_assignment: [Hand 1: ... / Hand 2: ...]
avatar_source: [REFERENCE IMAGE / TEXT GENERATED]
movement_context: [STATIC / WALKING / POST-WORKOUT /
                   GETTING READY / JUST WOKE UP / SITTING DOWN]
scene_details: [brief description of key visual elements
                visible in the scene for image generation]

Output plain text only.
`.trim();

function durationRules(seconds: 8 | 15 | 30) {
  if (seconds === 8) return "8 seconds total video → entire script (all spoken lines combined): MAXIMUM 16 words.";
  if (seconds === 30) return "30 seconds total video → entire script (all spoken lines combined): MAXIMUM 60 words.";
  return "15 seconds total video → entire script (all spoken lines combined): MAXIMUM 30 words.";
}

export async function POST(req: Request) {
  const { supabase, response, user: authUser } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const brandBrief = body?.brandBrief?.trim();
  if (!brandBrief) {
    return NextResponse.json({ error: "Missing `brandBrief`." }, { status: 400 });
  }

  const storeUrl = body?.storeUrl?.trim() ?? "";
  const productTitle = body?.productTitle?.trim() || null;
  const imageUrls = collectHttpsProductImageUrls(body ?? ({} as Body));
  const imageUrl = imageUrls[0] ?? null;
  const avatarRefs = Array.isArray(body?.avatarImageUrls)
    ? body.avatarImageUrls
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((u): u is string => /^https?:\/\//i.test(u))
        .slice(0, 3)
    : [];

  const videoDurationSeconds: 8 | 15 | 30 =
    body?.videoDurationSeconds === 8 || body?.videoDurationSeconds === 30
      ? body.videoDurationSeconds
      : 15;
  const generationMode = body?.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = body?.customUgcIntent?.trim() || "";
  const previousScriptsText = body?.previousScriptsText?.trim() || "";
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";

  const developer = [
    "Follow EVERY rule and the exact output structure in the instructions below.",
    "All spoken script lines must be in English.",
    `${durationRules(videoDurationSeconds)} Count only spoken words in HOOK, PROBLEM, SOLUTION, CTA.`,
    "Output plain text only, using the section headings exactly as specified (SCRIPT OPTION 1, VIDEO_METADATA, etc.).",
    generationMode === "custom_ugc"
      ? `Generation mode: CUSTOM UGC INTENT. Respect this user intent while still following all structural rules: ${customUgcIntent || "No talk, product-focused visual UGC."}`
      : "Generation mode: AUTOMATIC (standard Link to Ad).",
    previousScriptsText
      ? "Important: generate 3 NEW angles that are meaningfully different from the previous set. Do NOT reuse the same headline/hook/problem/benefits/CTA, and avoid similar phrasing."
      : "",
    "",
    UGC_SCRIPT_INSTRUCTIONS,
  ].join("\n");

  const imageNote =
    imageUrls.length === 0
      ? "No product image is attached; rely on the brand brief text only."
      : imageUrls.length > 1
        ? `I am attaching ${String(imageUrls.length)} product reference images (different angles when available) so you understand shape, branding, and packaging.`
        : "I am also attaching the product image for reference.";

  const avatarNote = avatarRefs.length > 0
    ? `AVATAR/PERSONA REFERENCE IMAGES ATTACHED: ${String(avatarRefs.length)} image(s). This is the person who will appear in the video. Match their appearance exactly. Do NOT describe their physical appearance in the script text — the image is the visual source of truth. Set avatar_source: REFERENCE IMAGE.`
    : "No avatar/persona reference image attached. Describe the persona fully in each script and set avatar_source: TEXT GENERATED.";

  const userPayload = [
    "Create 3 UGC video scripts for this product.",
    "",
    "Brand brief:",
    brandBrief,
    previousScriptsText ? "" : "",
    previousScriptsText ? "Previous angles (do NOT repeat these; create 3 different angles):" : "",
    previousScriptsText ? previousScriptsText : "",
    "",
    "Language: english",
    `Video length: ${String(videoDurationSeconds)} seconds`,
    "",
    "The scripts must follow the UGC AI script structure.",
    "Test 3 different marketing angles.",
    generationMode === "custom_ugc"
      ? `Custom UGC intent from user: ${customUgcIntent || "No talk, just show the product naturally."}`
      : "Mode: automatic generation from URL context.",
    "",
    imageNote,
    "",
    avatarNote,
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({
      v: 4,
      kind: "ugc_scripts_from_brief",
      provider,
      brandBrief,
      previousScriptsText,
      imageUrlsJoined: imageUrls.join("|"),
      avatarUrlsJoined: avatarRefs.join("|"),
      videoDurationSeconds,
      generationMode,
      customUgcIntent,
      storeUrl,
      productTitle,
    });

    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "ugc_scripts_from_brief")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) {
        const output = hit.output as { scriptsText?: string };
        if (typeof output?.scriptsText === "string") {
          return NextResponse.json({ data: output.scriptsText, cached: true });
        }
      }
    } catch {
      // ignore cache read errors
    }

    const allImageUrls = [...imageUrls, ...avatarRefs];
    const text =
      provider === "claude"
        ? allImageUrls.length > 0
          ? await claudeMessagesTextWithImages({ system: developer, user: userPayload, imageUrls: allImageUrls })
          : await claudeMessagesText({ system: developer, user: userPayload })
        : allImageUrls.length > 0
          ? (await openaiResponsesTextWithImages({ developer, userText: userPayload, imageUrls: allImageUrls })).text
          : (await openaiResponsesText({ developer, user: userPayload })).text;

    try {
      await supabase
        .from("gpt_cache")
        .insert({
          user_id: authUser.id,
          kind: "ugc_scripts_from_brief",
          cache_key: cacheKey,
          output: { scriptsText: text },
        })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data: String(text ?? "").trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
