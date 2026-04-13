export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";
import { matchUrlToCandidates } from "@/lib/imageUrl";
import { preFilterImages, type PreFilteredImage } from "@/lib/imagePreFilter";

type ImageMetaEntry = { url: string; alt?: string; w?: number; h?: number; source?: string };

type Body = {
  pageUrl: string;
  imageUrls: string[];
  imagesMeta?: ImageMetaEntry[];
  provider?: "gpt" | "claude";
};

/** Scored image from the 4-criteria Claude/GPT response. */
export type ScoredImage = {
  url: string;
  product_visibility: number;
  image_quality: number;
  background_clean: number;
  ugc_suitability: number;
  composite: number;
  reason?: string;
};

function isPngUrl(u: string): boolean {
  return /\.png(?:\?|$)/i.test(u);
}

function scoreUrl(u: string, meta?: ImageMetaEntry) {
  const s = u.toLowerCase();
  let score = 0;

  // ── Format signals ──
  if (/\.(png|jpg|jpeg|webp)(\?|$)/.test(s)) score += 2;
  if (isPngUrl(s)) score += 3;
  if (s.endsWith(".svg")) score -= 5;
  if (/\.(gif|ico)(\?|$)/.test(s)) score -= 3;

  // ── Positive URL patterns (product imagery) ──
  if (s.includes("product") || s.includes("products")) score += 4;
  if (s.includes("featured") || s.includes("main") || s.includes("hero")) score += 3;
  if (s.includes("pack") || s.includes("packshot")) score += 3;
  if (s.includes("gallery") || s.includes("carousel") || s.includes("slider")) score += 3;
  if (s.includes("zoom") || s.includes("large") || s.includes("full")) score += 2;
  if (s.includes("detail") || s.includes("pdp")) score += 2;
  if (s.includes("swatch") || s.includes("variant")) score += 1;

  // ── CDN hints ──
  if (s.includes("cdn.shopify.com")) score += 3;
  if (s.includes("shopifycdn") || s.includes("bigcommerce") || s.includes("woocommerce")) score += 2;

  // ── Negative URL patterns (non-product) ──
  if (s.includes("icon") || s.includes("logo") || s.includes("sprite") || s.includes("favicon")) score -= 8;
  if (s.includes("banner") || s.includes("promo") || s.includes("announcement")) score -= 3;
  if (s.includes("social") || s.includes("facebook") || s.includes("instagram") || s.includes("twitter") || s.includes("pinterest") || s.includes("tiktok") || s.includes("youtube")) score -= 4;
  if (s.includes("payment") || s.includes("visa") || s.includes("mastercard") || s.includes("paypal") || s.includes("stripe") || s.includes("klarna") || s.includes("afterpay")) score -= 5;
  if (s.includes("trustpilot") || s.includes("review") || s.includes("rating") || s.includes("star")) score -= 3;
  if (s.includes("badge") || s.includes("seal") || s.includes("certificate") || s.includes("guarantee")) score -= 2;
  if (s.includes("arrow") || s.includes("caret") || s.includes("chevron") || s.includes("close") || s.includes("hamburger") || s.includes("menu")) score -= 4;
  if (s.includes("avatar") || s.includes("profile") || s.includes("team") || s.includes("author") || s.includes("founder")) score -= 2;
  if (s.includes("blog") || s.includes("article") || s.includes("post")) score -= 2;
  if (s.includes("footer") || s.includes("header") || s.includes("nav")) score -= 2;
  if (s.includes("placeholder") || s.includes("loading") || s.includes("spinner") || s.includes("skeleton")) score -= 4;
  if (s.includes("pixel") || s.includes("tracking") || s.includes("analytics") || s.includes("beacon")) score -= 6;
  if (s.includes("flag") || s.includes("country") || s.includes("lang")) score -= 3;
  if (s.includes("cart") || s.includes("checkout") || s.includes("shipping")) score -= 2;

  // ── Metadata signals ──
  if (meta) {
    const alt = (meta.alt ?? "").toLowerCase();
    if (alt) {
      if (/product|item|bottle|box|package|tube|jar|serum|cream|shoe|sneaker|dress|shirt|watch|bag/.test(alt)) score += 3;
      if (/logo|icon|badge|arrow|close|menu|avatar|profile|flag|payment|social/.test(alt)) score -= 4;
    }

    if (meta.w && meta.h) {
      const area = meta.w * meta.h;
      if (area >= 90_000) score += 2;       // >= ~300x300
      if (area >= 250_000) score += 1;      // >= ~500x500
      if (area <= 3_600) score -= 3;        // <= ~60x60
      if (meta.w <= 50 || meta.h <= 50) score -= 3;
      if (meta.w >= 350 && meta.h >= 350) score += 2;
      if (meta.w <= 120 || meta.h <= 120) score -= 4;
    }

    if (meta.source === "json-ld") score += 5;
    if (meta.source === "product-context") score += 4;
    if (meta.source === "srcset") score += 1;
    if (meta.source === "og") score += 2;
  }

  return score;
}

/** composite = visibility×0.4 + quality×0.25 + background×0.2 + ugc×0.15 */
function compositeScore(s: { product_visibility: number; image_quality: number; background_clean: number; ugc_suitability: number }): number {
  return (
    s.product_visibility * 0.4 +
    s.image_quality * 0.25 +
    s.background_clean * 0.2 +
    s.ugc_suitability * 0.15
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when retrying the vision call may help (provider outage, rate limits, transient network). */
function isTransientVisionFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const low = msg.toLowerCase();
  if (low.includes("internal server error")) return true;
  if (low.includes("api_error")) return true;
  if (low.includes("overloaded")) return true;
  if (low.includes("rate_limit") || low.includes("rate limit")) return true;
  if (low.includes("timeout") || low.includes("timed out")) return true;
  if (low.includes("econnreset") || low.includes("etimedout") || low.includes("fetch failed")) return true;
  if (/\b50[0-9]\b/.test(msg)) return true;
  if (/\b52[9]\b/.test(msg)) return true;
  return false;
}

/**
 * When Claude/OpenAI vision fails, still return a valid classify payload so Link to Ad can continue.
 * Uses the same URL ordering as the vision step (pre-filter + heuristics).
 */
function buildHeuristicClassifyPayload(
  modelInputUrls: string[],
  candidateUrls: string[],
  preFiltered: PreFilteredImage[],
): {
  ranked: string[];
  candidateUrls: string[];
  productOnlyUrls: { url: string; reason?: string }[];
  otherUrls: string[];
  confidence: string;
  scored: ScoredImage[];
  preFiltered: { url: string; width: number; height: number }[];
} {
  const primary =
    modelInputUrls[0] ?? preFiltered[0]?.url ?? candidateUrls[0] ?? "";
  if (!primary) {
    throw new Error("No images left to use after preprocessing.");
  }
  const note =
    "Vision scoring skipped (provider error). Using the best-ranked image from URL heuristics instead.";
  const scored: ScoredImage[] = [
    {
      url: primary,
      product_visibility: 5,
      image_quality: 5,
      background_clean: 5,
      ugc_suitability: 5,
      composite: 5,
      reason: note,
    },
  ];
  const productOnlyUrls = [{ url: primary, reason: note }];
  const otherUrls = candidateUrls.filter((u) => u !== primary).slice(0, 25);

  return {
    ranked: modelInputUrls.length > 0 ? modelInputUrls : [primary],
    candidateUrls,
    productOnlyUrls,
    otherUrls,
    confidence: "low",
    scored,
    preFiltered: preFiltered.map((p) => ({ url: p.url, width: p.width, height: p.height })),
  };
}

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const urls = Array.isArray(body?.imageUrls) ? body!.imageUrls!.filter((x) => typeof x === "string") : [];
  if (!body?.pageUrl || urls.length === 0) {
    return NextResponse.json({ error: "Missing `pageUrl` or `imageUrls`." }, { status: 400 });
  }

  // Build a lookup from URL → HTML metadata (if provided by extract)
  const metaMap = new Map<string, ImageMetaEntry>();
  if (Array.isArray(body.imagesMeta)) {
    for (const m of body.imagesMeta) {
      if (typeof m?.url === "string") metaMap.set(m.url, m);
    }
  }

  // ── Step 1: heuristic pre-score all URLs ────────────────────────────────
  const initialScored = [...urls]
    .map((u) => ({ u, s: scoreUrl(u, metaMap.get(u)) }))
    .sort((a, b) => b.s - a.s);

  // Take top 25 for real-dimension pre-filtering (balance speed vs coverage)
  const preFilterBatch = initialScored.slice(0, 25).map((x) => x.u);
  const preFilterAttempted = new Set(preFilterBatch);

  // ── Step 2: real-dimension filter + perceptual dedup ────────────────────
  const preFiltered = await preFilterImages(preFilterBatch);

  // ── Step 3: build model input list ──────────────────────────────────────
  // Priority: images that passed pre-filter (confirmed real dims + unique)
  // then high-scored images not in the pre-filter batch (unverified but heuristically strong)
  const modelInputUrls = [
    ...preFiltered.map((p) => p.url),
    ...initialScored
      .filter((x) => !preFilterAttempted.has(x.u))
      .map((x) => x.u),
  ].slice(0, 12);

  // candidateUrls for backward-compat field: pre-filtered + heuristic positives
  const heuristicPositive = initialScored.filter((x) => x.s >= 3).map((x) => x.u);
  const pngPositive = heuristicPositive.filter((u) => isPngUrl(u));
  const candidateUrls = [
    ...new Set([...pngPositive, ...preFiltered.map((p) => p.url), ...heuristicPositive]),
  ].slice(0, 30);

  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";

  try {
    const cacheKey = makeCacheKey({ v: 5, pageUrl: body.pageUrl, ranked: modelInputUrls, provider });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "images_classify")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) return NextResponse.json({ data: hit.output, cached: true });
    } catch {
      // ignore cache failures
    }

    // ── Step 4: 4-score vision prompt ──────────────────────────────────────
    const urlListForPrompt = modelInputUrls
      .map((u, i) => `${i + 1}. ${u}`)
      .join("\n");

    const system = [
      "You are a product image analyst for e-commerce UGC content creation.",
      "Analyze each image shown and return a structured JSON score.",
      "Return STRICT JSON only — no markdown, no explanation outside the JSON.",
    ].join("\n");

    const userText = [
      `Product page: ${body.pageUrl}`,
      "",
      `Score each of the ${modelInputUrls.length} images shown using these 4 criteria (integer 0–10 each):`,
      "- product_visibility: Is the product clearly visible, well-lit and prominent? (10 = product fills frame perfectly)",
      "- image_quality: Resolution, sharpness, no blur/artifacts (10 = high-res studio quality)",
      "- background_clean: How clean/minimal is the background? (10 = pure white studio, 0 = cluttered scene)",
      "- ugc_suitability: Would this image work as a reference for UGC creation? (10 = perfect packshot for UGC)",
      "",
      "Return JSON:",
      "{",
      '  "images": [',
      '    { "url": "<EXACT URL>", "product_visibility": 0-10, "image_quality": 0-10, "background_clean": 0-10, "ugc_suitability": 0-10, "reason": "<1 sentence>" }',
      "  ],",
      '  "confidence": "low"|"medium"|"high"',
      "}",
      "",
      "CRITICAL: Every \"url\" must be copied EXACTLY from this list (character-for-character):",
      urlListForPrompt,
    ].join("\n");

    let text = "";
    const maxVisionAttempts = 3;
    for (let visionAttempt = 1; visionAttempt <= maxVisionAttempts; visionAttempt++) {
      try {
        text =
          provider === "claude"
            ? await claudeMessagesTextWithImages({ system, user: userText, imageUrls: modelInputUrls, maxTokens: 1600 })
            : (await openaiResponsesTextWithImages({ developer: system, userText, imageUrls: modelInputUrls })).text;
        break;
      } catch (e) {
        const retry = visionAttempt < maxVisionAttempts && isTransientVisionFailure(e);
        if (retry) {
          await sleep(450 * 2 ** (visionAttempt - 1));
          continue;
        }
        console.warn("[images-classify] vision provider failed:", e);
        const fallback = buildHeuristicClassifyPayload(modelInputUrls, candidateUrls, preFiltered);
        return NextResponse.json({ data: fallback, degraded: true });
      }
    }
    if (!text.trim()) {
      const fallback = buildHeuristicClassifyPayload(modelInputUrls, candidateUrls, preFiltered);
      return NextResponse.json({ data: fallback, degraded: true });
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      console.warn("[images-classify] model returned non-JSON; using heuristic fallback.");
      const fallback = buildHeuristicClassifyPayload(modelInputUrls, candidateUrls, preFiltered);
      return NextResponse.json({ data: fallback, degraded: true });
    }

    // ── Step 5: parse scores + compute composite ─────────────────────────
    const p = parsed as { images?: unknown; confidence?: unknown };
    const rawImages = Array.isArray(p.images) ? p.images : [];

    const scored: ScoredImage[] = [];
    for (const item of rawImages) {
      const obj = item as {
        url?: unknown;
        product_visibility?: unknown;
        image_quality?: unknown;
        background_clean?: unknown;
        ugc_suitability?: unknown;
        reason?: unknown;
      };
      const rawUrl = typeof obj?.url === "string" ? obj.url : "";
      if (!rawUrl.trim()) continue;
      const matched = matchUrlToCandidates(rawUrl, modelInputUrls, body.pageUrl);
      if (!matched) continue;

      const toScore = (v: unknown) => {
        const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
        return Math.max(0, Math.min(10, isNaN(n) ? 0 : n));
      };

      const pv = toScore(obj.product_visibility);
      const iq = toScore(obj.image_quality);
      const bc = toScore(obj.background_clean);
      const us = toScore(obj.ugc_suitability);

      scored.push({
        url: matched,
        product_visibility: pv,
        image_quality: iq,
        background_clean: bc,
        ugc_suitability: us,
        composite: compositeScore({ product_visibility: pv, image_quality: iq, background_clean: bc, ugc_suitability: us }),
        reason: typeof obj?.reason === "string" ? obj.reason : undefined,
      });
    }

    // Sort by composite score descending
    scored.sort((a, b) => b.composite - a.composite);

    // If model returned nothing, fall back gracefully
    if (scored.length === 0 && modelInputUrls.length > 0) {
      scored.push({
        url: modelInputUrls[0],
        product_visibility: 5,
        image_quality: 5,
        background_clean: 5,
        ugc_suitability: 5,
        composite: 5,
        reason: "Model returned no scores; using top-ranked image from extraction.",
      });
    }

    // ── Step 6: backward-compatible output ──────────────────────────────
    // Images with composite >= 5.0 → productOnlyUrls (good packshot quality)
    // Rest → otherUrls
    const PACKSHOT_THRESHOLD = 5.0;
    type UrlEntry = { url: string; reason?: string };

    const productOnlyUrls: UrlEntry[] = scored
      .filter((s) => s.composite >= PACKSHOT_THRESHOLD)
      .map((s) => ({ url: s.url, reason: s.reason }));

    const productOnlySet = new Set(productOnlyUrls.map((x) => x.url));
    const otherUrls: string[] = scored
      .filter((s) => !productOnlySet.has(s.url))
      .map((s) => s.url);

    // Ensure at least one productOnlyUrl
    if (productOnlyUrls.length === 0 && scored.length > 0) {
      productOnlyUrls.push({ url: scored[0].url, reason: scored[0].reason });
    }

    const data = {
      ranked: modelInputUrls,
      candidateUrls,
      productOnlyUrls,
      otherUrls,
      confidence: String(p.confidence ?? "low"),
      scored,
      preFiltered: preFiltered.map((p) => ({ url: p.url, width: p.width, height: p.height })),
    };

    try {
      await supabase
        .from("gpt_cache")
        .insert({ user_id: user.id, kind: "images_classify", cache_key: cacheKey, output: data })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
