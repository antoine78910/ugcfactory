export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import type { ReferenceShot } from "@/lib/intelligenceRecreateShotAnalysis";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { SEEDANCE_PRO_PROMPT_MAX_CHARS } from "@/lib/piapiSeedance";

const MAX_PRODUCT_IMAGES = 3;
const MAX_REFERENCE_IMAGES = 8;

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
  /**
   * First frame extracted from the competitor's video.
   * When provided it is the FIRST image sent to Claude (before any reference thumbnails)
   * and used as the visual composition / opening-shot reference.
   */
  videoFirstFrameUrl?: string | null;
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
  shotAnalysis?: {
    shots?: ReferenceShot[];
    keyframes?: ReferenceShot[];
    analyzedFrameCount?: number;
  };
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

You will receive images in this order:
1. (Optional) First frame extracted from the competitor's video — this is the ACTUAL visual opening of the ad. Analyze its exact composition: framing, subject placement, lighting, colour grading, background, camera distance, and angle. The recreated ad must start from a visually identical or nearly identical opening shot.
2. (Optional) Additional static reference images of the original ad (thumbnail, etc.).
3. User's product photos. These MUST be referenced as @image1, @image2, @image3 in the prompt in upload order.

Before writing the prompt, silently extract from the product images:
- Brand name (if visible on packaging / label)
- Primary + accent colours (hex or colour names)
- Packaging / product shape (e.g. "60 ml violet glass dropper bottle")
- Price perception cue (budget / mid-range / premium / luxury)
- Key visual differentiator (e.g. gradient foil label, minimalist matte finish)
Use these extracted details to write a highly consistent product description throughout the prompt.

Goal: write ONE Seedance 2.0 prompt that:
- Recreates the opening shot composition pixel-for-pixel from the first frame reference
- Faithfully mirrors the original ad's structure, pacing, and beat-by-beat
- Replaces every visible competitor brand identifier with the user's brand while preserving the original framing, timing, action, and pacing

Hard rules (Seedance 2.0):
- Length: 100 to 260 words. Plain prose, no bullet lists.
- Reference uploaded product images strictly as @image1, @image2, @image3 — in the order provided.
- Forbidden words (do not use): cinematic, professional, stunning, 8k, studio, perfect.
- For faceless lifestyle: do NOT describe bare legs, bodycon clothing, or shorts. Use "light linen wide-leg trousers" or similar.
- Always include literally: "No on-screen text, no captions, no subtitles."
- End with a one-line emotional closing starting with "The feeling of...".

Required structure (in this order, single paragraph or 2 short paragraphs):
1) Duration, aspect ratio, setting, lighting, time of day — matching the first-frame reference exactly.
2) Character description if any (age, hair, skin, outfit, accessories) — skip for faceless.
3) Camera setup (angle, distance, handheld vs static, selfie vs tripod) — mirroring the reference.
4) Scene/product description with @imageN references and full product visual details extracted above.
5) Beat-by-beat with narrow timestamps and dialogue (e.g. "0.0–0.7s: ...", "0.7–1.4s: ...").
6) Explicit brand-swap instructions for packaging, label, product body, visible logo, and app screen branding when applicable.
7) Tone description.
8) Camera movement / grain / film style.
9) "No on-screen text, no captions, no subtitles." then the emotional closing line.

Output ONLY the final prompt text. No markdown, no preamble, no headings.`;
}

export function buildUserPrompt(
  body: Required<Body>,
  videoFirstFrameUrl: string | null,
  refUrls: string[],
  productUrls: string[],
): string {
  const analyzedShots = body.shotAnalysis.shots ?? [];
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
  if (analyzedShots.length > 0) {
    lines.push(`Shot analysis: ${analyzedShots.length} shots detected from ${body.shotAnalysis.analyzedFrameCount} analyzed frames.`);
  }

  lines.push("");
  lines.push(`User product description (supplement with visual details from the product images): ${body.productDescription.trim() || "(not provided — extract entirely from product images)"}.`);
  lines.push(
    "Brand swap rule: replace the competitor's logo, packaging, product markings, labels, wordmarks, and any branded app/UI surfaces with the user's brand while keeping the same composition, timing, hand placement, and action.",
  );
  lines.push("");

  // Image ordering explanation
  let imageIdx = 1;
  if (videoFirstFrameUrl) {
    lines.push(`Image ${imageIdx}: THE FIRST FRAME of the competitor's video. This is the exact visual opening you must reproduce. Analyze and reproduce its framing, lighting, background, and subject placement.`);
    imageIdx++;
  }
  const combinedRefCount = refUrls.length;
  if (combinedRefCount > 0) {
    lines.push(
      `Image${imageIdx > 1 || combinedRefCount > 1 ? "s" : ""} ${imageIdx}–${imageIdx + combinedRefCount - 1}: Additional static reference frames of the original ad. Use for context only — do not reference them in the prompt.`,
    );
    imageIdx += combinedRefCount;
  }
  const productCount = productUrls.length;
  if (productCount > 0) {
    lines.push(
      `Image${productCount > 1 ? "s" : ""} ${imageIdx}–${imageIdx + productCount - 1}: The USER'S PRODUCT photos in order. Before writing the prompt, extract brand name, colours, packaging shape, and price-tier cue from them. Refer to them in the prompt as @image1${productCount >= 2 ? ", @image2" : ""}${productCount >= 3 ? ", @image3" : ""}.`,
    );
  } else {
    lines.push("(No product images provided — describe the product generically based on the description above.)");
  }

  lines.push("");
  if (analyzedShots.length > 0) {
    lines.push("Reference shot timeline:");
    for (const shot of analyzedShots) {
      const tags = [
        shot.brandingVisible ? "logo visible" : null,
        shot.packagingVisible ? "packaging visible" : null,
        shot.textVisible ? "text visible" : null,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `- ${shot.startSec.toFixed(1)}–${shot.endSec.toFixed(1)}s: ${shot.actionSummary}${
          tags ? ` (${tags})` : ""
        }.`,
      );
    }
    lines.push("");
  }
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

  const videoFirstFrameUrl =
    typeof body.videoFirstFrameUrl === "string" &&
    /^https?:\/\//i.test(body.videoFirstFrameUrl.trim())
      ? body.videoFirstFrameUrl.trim()
      : null;

  const referenceImageUrls = sanitizeUrls(body.referenceImageUrls, MAX_REFERENCE_IMAGES);
  const productImageUrls = sanitizeUrls(body.productImageUrls, MAX_PRODUCT_IMAGES);
  const productDescription = (body.productDescription ?? "").trim();
  const shotAnalysis = {
    shots: Array.isArray(body.shotAnalysis?.shots) ? body.shotAnalysis?.shots.filter(Boolean) : [],
    keyframes: Array.isArray(body.shotAnalysis?.keyframes) ? body.shotAnalysis?.keyframes.filter(Boolean) : [],
    analyzedFrameCount:
      typeof body.shotAnalysis?.analyzedFrameCount === "number" && Number.isFinite(body.shotAnalysis.analyzedFrameCount)
        ? body.shotAnalysis.analyzedFrameCount
        : 0,
  };
  const shotKeyframeUrls = sanitizeUrls(
    shotAnalysis.keyframes.map((shot) => shot.keyFrameUrl).filter((url): url is string => typeof url === "string"),
    MAX_REFERENCE_IMAGES,
  );

  if (productImageUrls.length === 0 && !productDescription) {
    return NextResponse.json(
      { error: "Add at least one product image or a product description." },
      { status: 400 },
    );
  }

  const safeBody: Required<Body> = {
    ad: body.ad ?? {},
    videoFirstFrameUrl: videoFirstFrameUrl ?? null,
    referenceImageUrls,
    productImageUrls,
    productDescription,
    clipType: body.clipType ?? "custom",
    aspectRatio: body.aspectRatio ?? "9:16",
    durationSec: typeof body.durationSec === "number" && body.durationSec > 0 ? body.durationSec : 10,
    shotAnalysis,
  };

  // Image order: [video first frame?, ...static ref thumbnails, ...product photos]
  const orderedImages = [
    ...(videoFirstFrameUrl ? [videoFirstFrameUrl] : []),
    // Avoid sending the first frame twice if it was also included in referenceImageUrls.
    ...[...shotKeyframeUrls, ...referenceImageUrls].filter((u, index, arr) => u !== videoFirstFrameUrl && arr.indexOf(u) === index),
    ...productImageUrls,
  ];

  try {
    const raw = await claudeMessagesTextWithImages({
      system: buildSystemPrompt(),
      user: buildUserPrompt(safeBody, videoFirstFrameUrl, referenceImageUrls.filter((u) => u !== videoFirstFrameUrl), productImageUrls),
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
      videoFirstFrameUrl,
      shotAnalysis,
      clipType: safeBody.clipType,
      aspectRatio: safeBody.aspectRatio,
      durationSec: safeBody.durationSec,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to draft the script.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
