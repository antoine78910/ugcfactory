export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { SEEDANCE_PRO_PROMPT_MAX_CHARS } from "@/lib/piapiSeedance";

const MAX_PRODUCT_IMAGES = 3;
const MAX_REFERENCE_IMAGES = 3;

const CLIP_TYPE_LABELS: Record<string, string> = {
  talking_head: "Talking head — a creator speaking selfie-style about the product",
  product_unboxing: "Product unboxing — opening packaging and reacting to the product",
  faceless_lifestyle: "Faceless lifestyle — aesthetic product shots, hands / lifestyle, no face",
  app_promo: "App promo — creator talks about the app and shows it on their phone",
  custom: "UGC short ad clip",
};

type Body = {
  /** Reference ad copy (headline / body / hook). */
  ad?: {
    headline?: string;
    body?: string;
    platform?: string;
  };
  /** Reference image / preview / thumbnail of the original ad. */
  referenceImageUrls?: string[];
  /** User's product images (1–3). The first image is the canonical product shot. */
  productImageUrls?: string[];
  /** Free-form description of the user's product (name + key benefit). */
  productDescription?: string;
  /** Optional preferred clip type. */
  clipType?: keyof typeof CLIP_TYPE_LABELS | string;
  /** Optional aspect ratio hint. */
  aspectRatio?: "9:16" | "16:9" | "1:1";
  /** Optional duration hint (seconds). */
  durationSec?: number;
};

function sanitizeUrls(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const u = raw.trim();
    if (!/^https?:\/\//i.test(u)) continue;
    if (out.length >= max) break;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

function buildSystemPrompt(): string {
  return `You are a creative director cloning a winning short-form UGC ad with a different product.

You will receive:
- Image #1 (and optionally a couple more) — the reference ad's frame(s).
- The next images — the user's product photos, in order. They MUST be referenced as @image1, @image2, @image3 in the prompt (in upload order).
- A short product description and copy text from the original ad.

Goal: write ONE Seedance 2.0 prompt that recreates the same ad style, structure, and beat-by-beat as the reference, but selling the user's product.

Hard rules (Seedance 2.0):
- Length: 100 to 260 words. Plain prose, no bullet lists.
- Reference uploaded product images strictly as @image1, @image2, @image3 — in the order provided.
- Forbidden words (do not use): cinematic, professional, stunning, 8k, studio, perfect.
- For faceless lifestyle: do NOT describe bare legs, bodycon clothing, or shorts (content moderation). Use "light linen wide-leg trousers" or similar covered clothing.
- Always include literally: "No on-screen text, no captions, no subtitles."
- End with a one-line emotional closing starting with "The feeling of...".

Required structure (in this order, single paragraph or 2 short paragraphs):
1) Duration, aspect ratio, setting, lighting, time of day.
2) Character description if any (age, hair, skin, outfit, accessories) — skip for faceless.
3) Camera setup (angle, distance, handheld vs static, selfie vs tripod).
4) Scene/product description with @imageN references.
5) Beat-by-beat with timestamps and dialogue (e.g. "0–2s: ...").
6) Tone description.
7) Camera movement / grain / film style.
8) "No on-screen text, no captions, no subtitles." then the emotional closing line.

Output ONLY the final prompt text. No markdown, no preamble, no headings.`;
}

function buildUserPrompt(body: Required<Body>, refUrls: string[], productUrls: string[]): string {
  const clipType = (body.clipType ?? "custom").toString().trim().toLowerCase();
  const clipLabel = CLIP_TYPE_LABELS[clipType] ?? CLIP_TYPE_LABELS.custom;
  const aspect = body.aspectRatio ?? "9:16";
  const duration = Number.isFinite(body.durationSec) && body.durationSec > 0 ? `${body.durationSec}s` : "10s";

  const adHeadline = (body.ad?.headline ?? "").trim();
  const adBody = (body.ad?.body ?? "").trim();
  const adPlatform = (body.ad?.platform ?? "").trim();

  const lines: string[] = [];
  lines.push(`Clip type: ${clipLabel}.`);
  lines.push(`Output format: ${aspect}, ${duration}, single shot continuous.`);
  if (adPlatform) lines.push(`Platform of original ad: ${adPlatform}.`);
  if (adHeadline) lines.push(`Original ad headline: "${adHeadline}".`);
  if (adBody) lines.push(`Original ad copy: "${adBody}".`);

  lines.push("");
  lines.push(`User product description: ${body.productDescription.trim() || "(not provided)"}.`);
  lines.push("");

  const refCount = refUrls.length;
  const productCount = productUrls.length;

  lines.push(
    refCount > 0
      ? `The first ${refCount} image${refCount > 1 ? "s" : ""} I am sending are FRAMES OF THE REFERENCE AD. Analyze them silently to extract the setting, character, camera, and beat structure. Do NOT reference them in the prompt — only use @image1..@image${productCount} for the user's product.`
      : "(No reference frames provided — infer style from the ad copy above.)",
  );
  lines.push(
    productCount > 0
      ? `The next ${productCount} image${productCount > 1 ? "s" : ""} are the USER'S PRODUCT photos in order. Refer to them in the prompt as @image1${productCount >= 2 ? ", @image2" : ""}${productCount >= 3 ? ", @image3" : ""} (matching upload order).`
      : "(No product images provided — describe the product generically based on the description.)",
  );

  lines.push("");
  lines.push("Now write the Seedance 2.0 prompt following the structure rules. Output ONLY the prompt text.");

  return lines.join("\n");
}

function clampPrompt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= SEEDANCE_PRO_PROMPT_MAX_CHARS) return trimmed;
  return trimmed.slice(0, SEEDANCE_PRO_PROMPT_MAX_CHARS).trim();
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const referenceImageUrls = sanitizeUrls(body.referenceImageUrls, MAX_REFERENCE_IMAGES);
  const productImageUrls = sanitizeUrls(body.productImageUrls, MAX_PRODUCT_IMAGES);
  const productDescription = (body.productDescription ?? "").trim();

  if (productImageUrls.length === 0 && !productDescription) {
    return NextResponse.json(
      { error: "Add at least one product image or a product description." },
      { status: 400 },
    );
  }

  const safeBody: Required<Body> = {
    ad: body.ad ?? {},
    referenceImageUrls,
    productImageUrls,
    productDescription,
    clipType: body.clipType ?? "custom",
    aspectRatio: body.aspectRatio ?? "9:16",
    durationSec: typeof body.durationSec === "number" && body.durationSec > 0 ? body.durationSec : 10,
  };

  const orderedImages = [...referenceImageUrls, ...productImageUrls];

  try {
    const raw = await claudeMessagesTextWithImages({
      system: buildSystemPrompt(),
      user: buildUserPrompt(safeBody, referenceImageUrls, productImageUrls),
      imageUrls: orderedImages,
      model: "claude-opus-4-7",
      maxTokens: 1600,
    });

    const prompt = clampPrompt(raw);
    if (!prompt) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }

    return NextResponse.json({
      prompt,
      productImageUrls,
      referenceImageUrls,
      clipType: safeBody.clipType,
      aspectRatio: safeBody.aspectRatio,
      durationSec: safeBody.durationSec,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to draft the script.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
