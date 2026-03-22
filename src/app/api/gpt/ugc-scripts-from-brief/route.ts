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
GPT SCRIPT — UGC AI Script Generator Framework (SaaS) v4

Purpose
1. Generate 3 UGC video scripts optimized for AI video generation (image-to-video).
2. Scripts must be short, natural, easy to segment into shots, and optimized for realistic lipsync.
3. Each script tests a different marketing angle while keeping the same persona.

Inputs (this API)
The user message includes a brand brief and optional product images. Infer from that context:
product name/type, target audience (age, gender, lifestyle), main pain point, 2–3 key benefits,
proof/transformation, and tone. The request also states video duration (8s, 15s, or 30s) — you MUST respect the total word cap for that duration.

Voice Profile Structure (include at the start of each full script block, before HOOK)
1. VOICE SIGNATURE: Gender, Age, Accent, Timbre
2. VOICE PERFORMANCE: Tone, Energy (1–5), Pacing (wpm or qualitative), Emotion, Sales intensity
3. Creator vibe, Sound environment, Background music
4. Rule: voice must stay consistent across shots

Script Structure (optimized for AI video)
1. HOOK — Short attention-grabbing line.
2. PROBLEM — User pain point.
3. SOLUTION — Product + main benefit (must be the longest spoken line in the script).
4. CTA — Short natural recommendation.

Word distribution per section (target ranges for spoken words; adjust if needed to stay under total cap)
1. HOOK: 3–5 words
2. PROBLEM: 5–7 words
3. SOLUTION: 10–14 words (must include product name or clear product reference + main benefit)
4. CTA: 3–4 words

Total spoken word limit by video duration (all HOOK+PROBLEM+SOLUTION+CTA combined — CRITICAL)
1. 8 seconds → maximum 16 words total
2. 15 seconds → maximum 30 words total
3. 30 seconds → maximum 60 words total
If the per-section targets would exceed the total cap, tighten each section proportionally while keeping SOLUTION the longest and preserving product + benefit in SOLUTION.

These limits keep lipsync stable and reduce hallucinations.

Writing style
1. Conversational English
2. Short sentences
3. One idea per sentence
4. No marketing jargon
5. Prefer shorter sentences to stay under limits

Gesture before speech (each section)
1. First line: brief action/gesture in parentheses, then the spoken line in quotes.
2. Example: (looks into camera) "I didn't expect this to work."

Scene context (before or after VOICE PROFILE as fits the template)
Describe persona (age, gender, vibe, relation to product), location, time of day, mood.

Metadata for SaaS (after each script option)
Each script option must be followed by a VIDEO_METADATA block with:
persona, location, camera_style, props, actions, tone, energy_level

Angle title (for the product UI — required after VIDEO_METADATA)
On the line immediately after VIDEO_METADATA, output exactly:
ANGLE_HEADLINE: followed by one English sentence of 12–24 words.
It must name the persona/vibe, the emotional hook, and what makes this option clearly different from the other two.
Do not paste script lines verbatim; summarize the creative angle.

Output format (exact headings)
SCRIPT OPTION 1
(full script: VOICE PROFILE, scene context if used, then HOOK/PROBLEM/SOLUTION/CTA each as (gesture) "line")

VIDEO_METADATA
(key: value lines or compact lines for the fields above)

ANGLE_HEADLINE: (one sentence, 12–24 words, as specified above)

SCRIPT OPTION 2
(same structure)

VIDEO_METADATA

ANGLE_HEADLINE: (one sentence, 12–24 words)

SCRIPT OPTION 3
(same structure)

VIDEO_METADATA

ANGLE_HEADLINE: (one sentence, 12–24 words)

Each script must test a different marketing angle.
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
