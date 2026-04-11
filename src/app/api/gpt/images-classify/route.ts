export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";
import { matchUrlToCandidates } from "@/lib/imageUrl";

type ImageMetaEntry = { url: string; alt?: string; w?: number; h?: number; source?: string };

type Body = {
  pageUrl: string;
  imageUrls: string[];
  imagesMeta?: ImageMetaEntry[];
  provider?: "gpt" | "claude";
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

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const urls = Array.isArray(body?.imageUrls) ? body!.imageUrls!.filter((x) => typeof x === "string") : [];
  if (!body?.pageUrl || urls.length === 0) {
    return NextResponse.json({ error: "Missing `pageUrl` or `imageUrls`." }, { status: 400 });
  }

  // Build a lookup from URL → metadata (if provided by extract)
  const metaMap = new Map<string, ImageMetaEntry>();
  if (Array.isArray(body.imagesMeta)) {
    for (const m of body.imagesMeta) {
      if (typeof m?.url === "string") metaMap.set(m.url, m);
    }
  }

  const scored = [...urls]
    .map((u) => ({ u, s: scoreUrl(u, metaMap.get(u)) }))
    .sort((a, b) => b.s - a.s);

  const ranked = scored.map((x) => x.u).slice(0, 20);
  const productish = scored.filter((x) => x.s >= 3).map((x) => x.u);
  const pngProductish = productish.filter((u) => isPngUrl(u));
  const candidateUrls = [...new Set([...pngProductish, ...productish])].slice(0, 30);
  const modelInputUrls = (candidateUrls.length ? candidateUrls : ranked).slice(0, 16);

  const developer = [
    "You are classifying e-commerce images.",
    "Return STRICT JSON only.",
    "Goal: identify which images show ONLY the product (packshot) with minimal background, suitable as a clean reference for image-to-image generation.",
    "Also return a short reason per selected image.",
  ].join("\n");

  const userText = [
    `Page URL: ${body.pageUrl}`,
    "",
    "You will be shown up to 16 images from the page.",
    "Return JSON: { productOnlyUrls: [{ url, reason }], otherUrls: [url], confidence: \"low\"|\"medium\"|\"high\" }",
    "If none are packshots, return empty productOnlyUrls.",
    "CRITICAL: Every `url` you return MUST be copied EXACTLY from the image URLs listed in the user message (character-for-character). Do not invent, shorten, or paraphrase URLs.",
  ].join("\n");

  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";

  try {
    const cacheKey = makeCacheKey({ v: 4, pageUrl: body.pageUrl, ranked: modelInputUrls, provider });
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

    const text =
      provider === "claude"
        ? await claudeMessagesTextWithImages({ system: developer, user: userText, imageUrls: modelInputUrls, maxTokens: 1200 })
        : (await openaiResponsesTextWithImages({ developer, userText, imageUrls: modelInputUrls })).text;

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON." }, { status: 502 });
    }

    const p = parsed as {
      productOnlyUrls?: unknown;
      otherUrls?: unknown;
      confidence?: unknown;
    };
    const rawProductOnly = Array.isArray(p.productOnlyUrls) ? p.productOnlyUrls : [];
    const rawOther = Array.isArray(p.otherUrls) ? p.otherUrls : [];

    type UrlEntry = { url: string; reason?: string };
    const productOnlyUrls: UrlEntry[] = [];
    for (const item of rawProductOnly) {
      const obj = item as { url?: unknown; reason?: unknown };
      const rawU = typeof obj?.url === "string" ? obj.url : typeof item === "string" ? item : "";
      if (!rawU.trim()) continue;
      const matched = matchUrlToCandidates(rawU, modelInputUrls, body.pageUrl);
      if (matched) {
        productOnlyUrls.push({
          url: matched,
          reason: typeof obj?.reason === "string" ? obj.reason : undefined,
        });
      }
    }

    if (productOnlyUrls.length === 0 && rawProductOnly.length > 0 && modelInputUrls.length > 0) {
      productOnlyUrls.push({
        url: modelInputUrls[0],
        reason: "Model URL did not match the page; using the top-ranked image from extraction.",
      });
    }

    const otherUrls: string[] = [];
    for (const item of rawOther) {
      if (typeof item !== "string" || !item.trim()) continue;
      const matched = matchUrlToCandidates(item, urls, body.pageUrl);
      if (matched) otherUrls.push(matched);
    }

    const data = {
      ranked: modelInputUrls,
      candidateUrls,
      productOnlyUrls,
      otherUrls,
      confidence: String(p.confidence ?? "low"),
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

