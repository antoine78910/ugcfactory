export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

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

function pickAround(text: string, keyword: string, windowChars = 900) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - Math.floor(windowChars / 2));
  const end = Math.min(text.length, idx + Math.floor(windowChars / 2));
  return cleanText(text.slice(start, end));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const rawUrl = (body?.url ?? "").trim();
  if (!rawUrl) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  let url: string;
  try {
    url = normalizeUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
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
  if (ogImage) images.push(ogImage);
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) images.push(twitterImage);
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-original");
    if (!src) return;
    if (src.startsWith("data:")) return;
    try {
      images.push(new URL(src, url).toString());
    } catch {
      // ignore
    }
  });

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
    images: uniqKeepOrder(images).slice(0, 20),
    excerpt,
    snippets,
    signals: {
      prices,
      textLength: bodyText.length,
    },
  });
}

