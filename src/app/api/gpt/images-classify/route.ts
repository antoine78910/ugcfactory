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

/** Scored image from vision JSON (5 criteria when model follows the schema). */
export type ScoredImage = {
  url: string;
  product_visibility: number;
  image_quality: number;
  background_clean: number;
  ugc_suitability: number;
  /** Full pack + readable label text (critical for pouches/sachets). Omitted in old cache → derived in parser. */
  packaging_readability?: number;
  /** Model: false if fingers, props, glare, or crop hide part of the printed label. */
  label_fully_legible?: boolean;
  composite: number;
  reason?: string;
};

function logImagesClassifySummary(
  pageUrl: string,
  scored: ScoredImage[],
  confidence: string,
  meta: { cached?: boolean; degraded?: boolean },
) {
  const base = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  console.log(
    `[images-classify] POST ${base.replace(/\/$/, "")}/api/gpt/images-classify · page=${pageUrl.slice(0, 120)}${pageUrl.length > 120 ? "…" : ""}`,
  );
  if (meta.cached) console.log("[images-classify] (served from gpt_cache)");
  if (meta.degraded) console.log("[images-classify] (degraded / heuristic fallback)");
  console.log(`[images-classify] confidence=${confidence} · ${scored.length} image(s) scored`);
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!;
    const leg = s.label_fully_legible === undefined ? "?" : s.label_fully_legible ? "yes" : "NO";
    console.log(
      `[images-classify]  #${i + 1} composite=${s.composite.toFixed(2)} pv=${s.product_visibility} iq=${s.image_quality} bc=${s.background_clean} ugc=${s.ugc_suitability} pkg=${s.packaging_readability ?? "?"} label_ok=${leg}`,
    );
    const u = s.url.length > 140 ? `${s.url.slice(0, 140)}…` : s.url;
    console.log(`[images-classify]      url: ${u}`);
    if (s.reason) console.log(`[images-classify]      reason: ${s.reason}`);
  }
}

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
  // Flexible pouch / sachet imagery (often needs full-pack + legible text)
  if (
    /sachet|pouch|doypack|flow-?pack|stick-?pack|flexible|resealable|zip-?lock|stand-?up|gusset|foil-?pack/i.test(s)
  ) {
    score += 2;
  }

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
      if (
        /product|item|bottle|box|package|tube|jar|serum|cream|shoe|sneaker|dress|shirt|watch|bag|pouch|sachet|doypack|stick\s*pack|supplement|powder|gummies/i.test(
          alt,
        )
      ) {
        score += 3;
      }
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

/** Weighted composite; packaging_readability matters for pouches/sachets and label fidelity. */
function compositeScore(s: {
  product_visibility: number;
  image_quality: number;
  background_clean: number;
  ugc_suitability: number;
  packaging_readability: number;
}): number {
  return (
    s.product_visibility * 0.3 +
    s.image_quality * 0.2 +
    s.background_clean * 0.14 +
    s.ugc_suitability * 0.12 +
    s.packaging_readability * 0.24
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
  suggest_additional_product_photos: boolean;
  preFiltered: { url: string; width: number; height: number }[];
} {
  const primary =
    modelInputUrls[0] ?? preFiltered[0]?.url ?? candidateUrls[0] ?? "";
  if (!primary) {
    throw new Error("No images left to use after preprocessing.");
  }
  const note =
    "Vision scoring skipped (provider error). Using the best-ranked image from URL heuristics instead.";
  const pv = 5;
  const iq = 5;
  const bc = 5;
  const us = 5;
  const pr = 5;
  const scored: ScoredImage[] = [
    {
      url: primary,
      product_visibility: pv,
      image_quality: iq,
      background_clean: bc,
      ugc_suitability: us,
      packaging_readability: pr,
      label_fully_legible: undefined,
      composite: compositeScore({
        product_visibility: pv,
        image_quality: iq,
        background_clean: bc,
        ugc_suitability: us,
        packaging_readability: pr,
      }),
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
    suggest_additional_product_photos: true,
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
    const cacheKey = makeCacheKey({ v: 7, pageUrl: body.pageUrl, ranked: modelInputUrls, provider });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "images_classify")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) {
        const out = hit.output as {
          scored?: ScoredImage[];
          confidence?: string;
        };
        if (Array.isArray(out.scored)) {
          logImagesClassifySummary(body.pageUrl, out.scored, String(out.confidence ?? "low"), { cached: true });
        }
        return NextResponse.json({ data: hit.output, cached: true });
      }
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
      "Return STRICT JSON only, no markdown, no explanation outside the JSON.",
    ].join("\n");

    const userText = [
      `Product page: ${body.pageUrl}`,
      "",
      `Score each of the ${modelInputUrls.length} images shown using these 5 criteria (integer 0–10 each):`,
      "- product_visibility: Is the product clearly visible, well-lit and prominent? (10 = product fills frame perfectly)",
      "- image_quality: Resolution, sharpness, no blur/artifacts (10 = high-res studio quality)",
      "- background_clean: How clean/minimal is the background? (10 = pure white studio, 0 = cluttered scene)",
      "- ugc_suitability: Would this image work as a reference for UGC / image-generation models? (10 = ideal packshot)",
      "- packaging_readability: For the PRIMARY sellable unit (bottle, box, pouch, sachet, bag, tub, etc.): is the entire pack visible (not cropped), and is printed brand/ingredient text sharp and readable? (10 = full pack + all important wording legible). Heavily penalize crops that cut off lines of text. For supplements/food in flexible pouches or sachets, prefer shots where the printed pouch/sachet is the hero over bare product with no visible pack, rank those higher when both exist.",
      "",
      "Also set per image (required):",
      '- label_fully_legible: boolean, true only if NO important printed words appear covered by a hand, another object, glare, shadow, sticker, or edge crop; false if any wording is partly hidden or unreadable.',
      "",
      "Return JSON:",
      "{",
      '  "images": [',
      '    { "url": "<EXACT URL>", "product_visibility": 0-10, "image_quality": 0-10, "background_clean": 0-10, "ugc_suitability": 0-10, "packaging_readability": 0-10, "label_fully_legible": true|false, "reason": "<1 sentence; say if another angle is needed for full label>" }',
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
        logImagesClassifySummary(body.pageUrl, fallback.scored, fallback.confidence, { degraded: true });
        return NextResponse.json({ data: fallback, degraded: true });
      }
    }
    if (!text.trim()) {
      const fallback = buildHeuristicClassifyPayload(modelInputUrls, candidateUrls, preFiltered);
      logImagesClassifySummary(body.pageUrl, fallback.scored, fallback.confidence, { degraded: true });
      return NextResponse.json({ data: fallback, degraded: true });
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      console.warn("[images-classify] model returned non-JSON; using heuristic fallback.");
      const fallback = buildHeuristicClassifyPayload(modelInputUrls, candidateUrls, preFiltered);
      logImagesClassifySummary(body.pageUrl, fallback.scored, fallback.confidence, { degraded: true });
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
        packaging_readability?: unknown;
        label_fully_legible?: unknown;
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
      const hasPkg = obj.packaging_readability !== undefined && obj.packaging_readability !== null && String(obj.packaging_readability).trim() !== "";
      let pr = hasPkg ? toScore(obj.packaging_readability) : Math.round(Math.min(10, Math.max(0, pv * 0.55 + us * 0.45)));
      const labelOk =
        typeof obj.label_fully_legible === "boolean" ? obj.label_fully_legible : undefined;
      if (labelOk === false) {
        pr = Math.min(pr, 5);
      }

      scored.push({
        url: matched,
        product_visibility: pv,
        image_quality: iq,
        background_clean: bc,
        ugc_suitability: us,
        packaging_readability: pr,
        label_fully_legible: labelOk,
        composite: compositeScore({
          product_visibility: pv,
          image_quality: iq,
          background_clean: bc,
          ugc_suitability: us,
          packaging_readability: pr,
        }),
        reason: typeof obj?.reason === "string" ? obj.reason : undefined,
      });
    }

    // Best matches first: composite, then packaging legibility (pouch/pack shots), then label_ok
    scored.sort((a, b) => {
      const d = b.composite - a.composite;
      if (Math.abs(d) > 0.35) return d;
      const prd = (b.packaging_readability ?? 0) - (a.packaging_readability ?? 0);
      if (Math.abs(prd) > 0.01) return prd;
      const la = a.label_fully_legible === false ? 0 : 1;
      const lb = b.label_fully_legible === false ? 0 : 1;
      return lb - la;
    });

    // If model returned nothing, fall back gracefully
    if (scored.length === 0 && modelInputUrls.length > 0) {
      {
        const pv0 = 5;
        const iq0 = 5;
        const bc0 = 5;
        const us0 = 5;
        const pr0 = 5;
        scored.push({
          url: modelInputUrls[0],
          product_visibility: pv0,
          image_quality: iq0,
          background_clean: bc0,
          ugc_suitability: us0,
          packaging_readability: pr0,
          label_fully_legible: undefined,
          composite: compositeScore({
            product_visibility: pv0,
            image_quality: iq0,
            background_clean: bc0,
            ugc_suitability: us0,
            packaging_readability: pr0,
          }),
          reason: "Model returned no scores; using top-ranked image from extraction.",
        });
      }
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

    // If the best frame still has weak packaging legibility, add extra high-ranked URLs so users/models can combine angles.
    const best = scored[0];
    const bestPkg = best?.packaging_readability;
    if (
      typeof bestPkg === "number" &&
      bestPkg < 6 &&
      scored.length > 1 &&
      productOnlyUrls.length > 0 &&
      productOnlyUrls.length < 5
    ) {
      const already = new Set(productOnlyUrls.map((x) => x.url));
      for (const s of scored.slice(1)) {
        if (productOnlyUrls.length >= 5) break;
        if (already.has(s.url)) continue;
        if (s.composite < 4.25) continue;
        const extraReason =
          s.reason?.trim() ||
          "Additional reference, combine with the main image if label or pouch details are split across shots.";
        productOnlyUrls.push({ url: s.url, reason: extraReason });
        already.add(s.url);
      }
    }

    const MAX_PRODUCT_ONLY_URLS = 5;
    const trimmedProductOnly = productOnlyUrls.slice(0, MAX_PRODUCT_ONLY_URLS);
    const topFive = scored.slice(0, 5);
    const hasStrongPackaging = topFive.some((s) => (s.packaging_readability ?? 0) >= 7);
    const labelObstructed = topFive.some((s) => s.label_fully_legible === false);
    const suggest_additional_product_photos = scored.length > 0 && (!hasStrongPackaging || labelObstructed);

    const data = {
      ranked: modelInputUrls,
      candidateUrls,
      productOnlyUrls: trimmedProductOnly,
      otherUrls,
      confidence: String(p.confidence ?? "low"),
      scored,
      suggest_additional_product_photos,
      preFiltered: preFiltered.map((p) => ({ url: p.url, width: p.width, height: p.height })),
    };

    logImagesClassifySummary(body.pageUrl, scored, data.confidence, {});

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
