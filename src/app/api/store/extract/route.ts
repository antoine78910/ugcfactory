export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { fetchStorePageHtmlForExtract } from "@/lib/storeExtractFetch";

/** Reject requests targeting private/internal IP ranges (SSRF protection). */
function isPrivateHost(hostname: string): boolean {
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (hostname === "localhost") return true;
  if (hostname === "::1" || hostname === "[::1]") return true;
  return false;
}

function normalizeUrl(u: string) {
  const url = new URL(u);
  return url.toString();
}

function cleanText(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function uniqKeepOrder(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const v = x.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

type ImageMeta = { url: string; alt?: string; w?: number; h?: number; source: string };

function uniqMetaKeepOrder(items: ImageMeta[]): ImageMeta[] {
  const seen = new Set<string>();
  const out: ImageMeta[] = [];
  for (const x of items) {
    const v = x.url.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(x);
  }
  return out;
}

const JUNK_URL_RE =
  /(?:tracking|pixel|beacon|spacer|blank|transparent|spinner|loader|placeholder)\b/i;
const JUNK_EXT_RE = /\.(gif|svg|ico)(?:\?|$)/i;

function looksLikeJunkImage(u: string, w?: number, h?: number): boolean {
  if (w != null && h != null && w <= 3 && h <= 3) return true;
  if (w != null && w <= 1) return true;
  if (h != null && h <= 1) return true;
  if (JUNK_URL_RE.test(u)) return true;
  if (/base64/i.test(u)) return true;
  return false;
}

function parseIntMaybe(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseSrcsetUrls(srcset: string | undefined, baseUrl: string): string[] {
  if (!srcset) return [];
  const parts = srcset
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const urls: string[] = [];
  for (const part of parts) {
    const [u] = part.split(/\s+/);
    if (!u) continue;
    if (u.startsWith("data:")) continue;
    try {
      urls.push(new URL(u, baseUrl).toString());
    } catch {
      // ignore
    }
  }
  return urls;
}

function extractStyleUrls(style: string | undefined, baseUrl: string): string[] {
  if (!style) return [];
  const out: string[] = [];
  const re = /url\((['"]?)(.*?)\1\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(style))) {
    const raw = m[2]?.trim();
    if (!raw) continue;
    if (raw.startsWith("data:")) continue;
    try {
      out.push(new URL(raw, baseUrl).toString());
    } catch {
      // ignore
    }
  }
  return out;
}

function tryParseJsonLdProducts($: cheerio.CheerioAPI) {
  const products: Array<{ name?: string; image?: string | string[]; offers?: unknown }> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const t = (node as any)?.["@type"];
        if (t === "Product") products.push(node);
        // Some sites nest Product inside @graph
        const graph = (node as any)?.["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if ((g as any)?.["@type"] === "Product") products.push(g);
          }
        }
      }
    } catch {
      // ignore
    }
  });
  return products;
}

function pickAround(text: string, keyword: string, windowChars = 900) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - Math.floor(windowChars / 2));
  const end = Math.min(text.length, idx + Math.floor(windowChars / 2));
  return cleanText(text.slice(start, end));
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const rawUrl = (body?.url ?? "").trim();
  if (!rawUrl) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  let url: string;
  try {
    url = normalizeUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  // SSRF protection: reject internal/private hosts
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only http(s) URLs are allowed." }, { status: 400 });
    }
    if (isPrivateHost(parsed.hostname)) {
      return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  const fetched = await fetchStorePageHtmlForExtract(url);
  if (fetched.ok === false) {
    return fetched.response;
  }
  const html = fetched.html;

  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title = cleanText($("title").first().text() || "");
  const ogTitle = cleanText($('meta[property="og:title"]').attr("content") || "");
  const metaDesc = cleanText($('meta[name="description"]').attr("content") || "");
  const ogDesc = cleanText($('meta[property="og:description"]').attr("content") || "");
  const canonical = $('link[rel="canonical"]').attr("href") || "";

  // ── Collect images with metadata ─────────────────────────────────────
  // Priority buckets: JSON-LD product images → OG/Twitter → gallery/product-context → all other <img>
  const jsonLdBucket: ImageMeta[] = [];
  const ogBucket: ImageMeta[] = [];
  const productContextBucket: ImageMeta[] = [];
  const generalBucket: ImageMeta[] = [];

  function resolve(raw: string): string | null {
    if (!raw || raw.startsWith("data:")) return null;
    try { return new URL(raw.trim(), url).toString(); } catch { return null; }
  }

  // JSON-LD Product images (best packshots)
  const ldProducts = tryParseJsonLdProducts($);
  for (const p of ldProducts) {
    const img = (p as any)?.image;
    const imgs = typeof img === "string" ? [img] : Array.isArray(img) ? img : [];
    for (const i of imgs) {
      if (typeof i !== "string") continue;
      const u = resolve(i);
      if (u) jsonLdBucket.push({ url: u, alt: (p as any)?.name, source: "json-ld" });
    }
  }

  // OG / Twitter meta images
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogResolved = ogImage ? resolve(ogImage) : null;
  if (ogResolved) ogBucket.push({ url: ogResolved, source: "og" });

  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  const twResolved = twitterImage ? resolve(twitterImage) : null;
  if (twResolved) ogBucket.push({ url: twResolved, source: "twitter" });

  // Preload images
  $('link[rel="preload"][as="image"]').each((_, el) => {
    const u = resolve($(el).attr("href") ?? "");
    if (u) ogBucket.push({ url: u, source: "preload" });
  });

  // picture/source srcset
  $("source").each((_, el) => {
    const ss = $(el).attr("srcset") || $(el).attr("data-srcset");
    for (const u of parseSrcsetUrls(ss, url)) {
      generalBucket.push({ url: u, source: "source" });
    }
  });

  // <img> elements with metadata
  const PRODUCT_CONTAINER_RE =
    /product|gallery|carousel|slider|main-image|hero-image|featured|swiper|pdp|detail/i;

  $("img").each((_, el) => {
    const $el = $(el);
    const src =
      $el.attr("src") || $el.attr("data-src") || $el.attr("data-original") || $el.attr("data-lazy-src");
    if (!src) return;
    const u = resolve(src);
    if (!u) return;

    const alt = cleanText($el.attr("alt") ?? "");
    const w = parseIntMaybe($el.attr("width"));
    const h = parseIntMaybe($el.attr("height"));

    if (looksLikeJunkImage(u, w, h)) return;

    const meta: ImageMeta = { url: u, alt: alt || undefined, w, h, source: "img" };

    // Check if inside a product-context container
    const parentChain = $el.parents().toArray().slice(0, 6);
    const inProductContext = parentChain.some((p) => {
      const cls = $(p).attr("class") ?? "";
      const id = $(p).attr("id") ?? "";
      const role = $(p).attr("role") ?? "";
      return PRODUCT_CONTAINER_RE.test(cls) || PRODUCT_CONTAINER_RE.test(id) || role === "img";
    });

    if (inProductContext) {
      meta.source = "product-context";
      productContextBucket.push(meta);
    } else {
      generalBucket.push(meta);
    }

    // Also collect srcset variants
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    for (const ssUrl of parseSrcsetUrls(srcset, url)) {
      if (!looksLikeJunkImage(ssUrl, w, h)) {
        generalBucket.push({ url: ssUrl, alt: alt || undefined, w, h, source: "srcset" });
      }
    }
  });

  // Inline styles background-image
  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    for (const u of extractStyleUrls(style, url)) {
      if (!looksLikeJunkImage(u)) generalBucket.push({ url: u, source: "bg" });
    }
  });

  // Merge in priority order: JSON-LD → OG → product-context → general
  const allMeta = uniqMetaKeepOrder([
    ...jsonLdBucket,
    ...ogBucket,
    ...productContextBucket,
    ...generalBucket,
  ]).slice(0, 80);

  const images = allMeta.map((m) => m.url);

  const bodyText = cleanText($("body").text());
  const excerpt = bodyText.slice(0, 9000);

  const keywords = [
    "faq",
    "livraison",
    "shipping",
    "retour",
    "return",
    "garantie",
    "warranty",
    "avis",
    "reviews",
    "ingredients",
    "ingrédients",
    "how it works",
    "comment ça marche",
    "before",
    "après",
  ];
  const snippets = uniqKeepOrder(
    keywords
      .map((k) => pickAround(bodyText, k))
      .filter((x): x is string => typeof x === "string" && x.length > 0),
  ).slice(0, 12);

  // crude price signals (kept as "raw")
  const prices = uniqKeepOrder(
    (bodyText.match(/(?:€|\$)\s?\d{1,4}(?:[.,]\d{2})?/g) ?? []).slice(0, 30),
  );

  return NextResponse.json({
    url,
    canonical: canonical ? (() => { try { return new URL(canonical, url).toString(); } catch { return canonical; } })() : null,
    title: ogTitle || title || null,
    description: ogDesc || metaDesc || null,
    images,
    imagesMeta: allMeta.map((m) => ({
      url: m.url,
      ...(m.alt ? { alt: m.alt } : {}),
      ...(m.w ? { w: m.w } : {}),
      ...(m.h ? { h: m.h } : {}),
      source: m.source,
    })),
    excerpt,
    snippets,
    signals: {
      prices,
      textLength: bodyText.length,
    },
    structured: {
      jsonLdProducts: ldProducts
        .map((p) => ({
          name: (p as any)?.name,
          image: (p as any)?.image,
          offers: (p as any)?.offers,
        }))
        .slice(0, 3),
    },
  });
}

