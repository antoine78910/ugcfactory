export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

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

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Fetch failed: HTTP ${res.status}`, details: t.slice(0, 500) },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Fetch failed: ${message}` }, { status: 502 });
  }

  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title = cleanText($("title").first().text() || "");
  const ogTitle = cleanText($('meta[property="og:title"]').attr("content") || "");
  const metaDesc = cleanText($('meta[name="description"]').attr("content") || "");
  const ogDesc = cleanText($('meta[property="og:description"]').attr("content") || "");
  const canonical = $('link[rel="canonical"]').attr("href") || "";

  const images: string[] = [];
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage && !ogImage.startsWith("data:")) {
    try {
      images.push(new URL(ogImage.trim(), url).toString());
    } catch {
      images.push(ogImage);
    }
  }
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage && !twitterImage.startsWith("data:")) {
    try {
      images.push(new URL(twitterImage.trim(), url).toString());
    } catch {
      images.push(twitterImage);
    }
  }

  // preload images
  $('link[rel="preload"][as="image"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      images.push(new URL(href, url).toString());
    } catch {
      // ignore
    }
  });

  // picture/source srcset
  $("source").each((_, el) => {
    const ss = $(el).attr("srcset") || $(el).attr("data-srcset");
    images.push(...parseSrcsetUrls(ss, url));
  });

  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-original") ||
      $(el).attr("data-lazy-src");
    if (!src) return;
    if (src.startsWith("data:")) return;
    try {
      images.push(new URL(src, url).toString());
    } catch {
      // ignore
    }

    const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
    images.push(...parseSrcsetUrls(srcset, url));
  });

  // inline styles background-image
  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    images.push(...extractStyleUrls(style, url));
  });

  // JSON-LD Product images (often best packshots)
  const ldProducts = tryParseJsonLdProducts($);
  for (const p of ldProducts) {
    const img = (p as any)?.image;
    if (typeof img === "string") {
      try {
        images.push(new URL(img, url).toString());
      } catch {
        images.push(img);
      }
    } else if (Array.isArray(img)) {
      for (const i of img) {
        if (typeof i !== "string") continue;
        try {
          images.push(new URL(i, url).toString());
        } catch {
          images.push(i);
        }
      }
    }
  }

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
    images: uniqKeepOrder(images).slice(0, 80),
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

