export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";

type Body = {
  storeUrl?: string;
  productTitle?: string | null;
  brandBrief: string;
  /** @deprecated Prefer `productImageUrls`; kept for older clients */
  productImageUrl?: string | null;
  /** Up to 3 HTTPS product references (multi-angle) for GPT vision */
  productImageUrls?: string[] | null;
  /** 8 | 15 | 30 — drives max word count per script */
  videoDurationSeconds?: 8 | 15 | 30;
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
Tu es un expert en écriture de scripts UGC optimisés pour la génération vidéo par intelligence artificielle.
Ta mission est de générer 3 scripts UGC différents pour tester 3 angles marketing différents, tout en gardant le même persona cible.
Les scripts doivent être optimisés pour :
- lipsync IA
- segmentation en shots
- réalisme UGC
- génération image-to-video

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

PRODUCT IS WEARABLE (clothing, jewelry, accessory):
→ Avatar must wear the exact item shown in the image
→ Match color, style, fit exactly

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
RÈGLES FONDAMENTALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Les scripts doivent toujours respecter la structure suivante :
- HOOK
- PROBLEM
- SOLUTION
- CTA

La phrase SOLUTION doit toujours inclure le produit et son bénéfice principal.
La phrase SOLUTION doit être la plus longue du script.
Aucune digression.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RÈGLES DE LONGUEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selon la durée de la vidéo :
- 8 seconds → maximum 16 words
- 15 seconds → maximum 30 words
- 30 seconds → maximum 60 words

Ne jamais dépasser ces limites pour garder un lipsync stable et éviter les dégénérations.
Chaque phrase doit rester courte et naturelle.
Une idée par phrase.
Une phrase par section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE D'ÉCRITURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le script doit :
- ressembler à quelqu'un qui parle
- utiliser des mots simples
- utiliser des pauses naturelles
- être conversationnel
- éviter le jargon marketing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE OBLIGATOIRE DES SCÈNES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaque section doit suivre la structure :
(gesture/action)
"spoken sentence"

Le geste doit toujours venir avant la parole.
Le geste doit être physiquement possible selon la TWO HANDS RULE.
Le geste doit être cohérent avec le product state identifié en STEP 0.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le script doit commencer par un bloc :

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

Rule: voice must remain consistent across shots.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IF an avatar image is provided:
→ Do NOT describe physical appearance (face, skin tone, hair, body type)
→ Only describe: age range, genre, vibe, relation au produit
→ The avatar image is the visual source of truth
→ Add in VIDEO_METADATA:
   avatar_source: REFERENCE IMAGE

IF no avatar image is provided:
→ Describe the persona fully:
   • âge
   • genre
   • apparence (peau, cheveux, morphologie)
   • vibe
   • relation au produit
→ Add in VIDEO_METADATA:
   avatar_source: TEXT GENERATED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Décrire :
- lieu
- moment de la journée
- ambiance

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT ATTENDU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le GPT doit générer :

SCRIPT OPTION 1
(script)
VIDEO_METADATA

SCRIPT OPTION 2
(script)
VIDEO_METADATA

SCRIPT OPTION 3
(script)
VIDEO_METADATA

Chaque script doit tester un angle marketing différent.

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

  const videoDurationSeconds: 8 | 15 | 30 =
    body?.videoDurationSeconds === 8 || body?.videoDurationSeconds === 30
      ? body.videoDurationSeconds
      : 15;

  const developer = [
    "You are an expert UGC scriptwriter for AI video (lipsync, shot segmentation, image-to-video).",
    "Follow EVERY rule and the exact output structure in the GPT SCRIPT block below.",
    "Write all spoken script lines in English (brand brief language style: English).",
    `${durationRules(videoDurationSeconds)} Count only spoken words in HOOK, PROBLEM, SOLUTION, CTA.`,
    "Output plain text only, using the section headings exactly as specified (SCRIPT OPTION 1, VIDEO_METADATA, etc.).",
    "",
    UGC_SCRIPT_INSTRUCTIONS,
  ].join("\n");

  const imageNote =
    imageUrls.length === 0
      ? "No product image is attached; rely on the brand brief text only."
      : imageUrls.length > 1
        ? `I am attaching ${String(imageUrls.length)} product reference images (different angles when available) so you understand shape, branding, and packaging.`
        : "I am also attaching the product image for reference.";

  const userPayload = [
    "Create 3 UGC video scripts for this product.",
    "",
    "Brand brief (que l'on aura crée):",
    brandBrief,
    "",
    "Language: english",
    `Video length: ${String(videoDurationSeconds)} seconds`,
    "",
    "The scripts must follow the UGC AI script structure.",
    "Test 3 different marketing angles.",
    "",
    imageNote,
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({
      v: 1,
      kind: "ugc_scripts_from_brief",
      brandBrief,
      imageUrlsJoined: imageUrls.join("|"),
      videoDurationSeconds,
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

    const { text } =
      imageUrls.length > 0
        ? await openaiResponsesTextWithImages({
            developer,
            userText: userPayload,
            imageUrls: imageUrls,
          })
        : await openaiResponsesText({ developer, user: userPayload });

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

    return NextResponse.json({ data: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
