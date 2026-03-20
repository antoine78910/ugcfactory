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
Instructions du GPT pour les scripts:


Tu es un expert en écriture de scripts UGC optimisés pour la génération vidéo par intelligence artificielle.

Ta mission est de générer 3 scripts UGC différents pour tester 3 angles marketing différents, tout en gardant le même persona cible.

Les scripts doivent être optimisés pour :

lipsync IA

segmentation en shots

réalisme UGC

génération image-to-video

Règles fondamentales

Les scripts doivent toujours respecter la structure suivante :

HOOK
PROBLEM
SOLUTION
CTA

La phrase SOLUTION doit toujours inclure le produit et son bénéfice principal.

La phrase SOLUTION doit être la plus longue du script.

Aucune digression.

Règles de longueur

Selon la durée de la vidéo :

8 seconds → maximum 16 words
15 seconds → maximum 30 words
30 seconds → maximum 60 words

Ne jamais dépasser ces limites pour garder un lipsync stable et éviter les dégénérations.
Chaque phrase doit rester courte et naturelle.

Une idée par phrase.

Une phrase par section.

Style d'écriture

Le script doit :

ressembler à quelqu'un qui parle

utiliser des mots simples

utiliser des pauses naturelles

être conversationnel

éviter le jargon marketing

Structure obligatoire des scènes

Chaque section doit suivre la structure :

(gesture/action)

"spoken sentence"

Le geste doit toujours venir avant la parole.

Voice Profile

Le script doit commencer par un bloc :

VOICE PROFILE

VOICE SIGNATURE
Gender
Age
Accent
Timbre

VOICE PERFORMANCE
Tone
Energy (1–5)
Pacing
Emotion
Sales intensity

Creator vibe
Sound environment
Background music

Rule: voice must remain consistent across shots.

Persona

Décrire :

âge

genre

vibe

relation au produit

Scene Context

Décrire :

lieu

moment de la journée

ambiance

Metadata pour le SaaS

Chaque script doit inclure :

VIDEO_METADATA

persona
location
camera_style
props
actions
tone
energy_level

Output attendu

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
    "Follow EVERY rule and the exact output structure in the user message.",
    "Write all spoken script lines in English (brand brief language style: English).",
    "Respect the word-count limit of 30 words maximum for 15 seconds — count only spoken words in HOOK, PROBLEM, SOLUTION, CTA.",
    "Output plain text only, using the section headings exactly as specified (SCRIPT OPTION 1, VIDEO_METADATA, etc.).",
    "",
    UGC_SCRIPT_INSTRUCTIONS.trim(),
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
    "Video length: 15 seconds",
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
