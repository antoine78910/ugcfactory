export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";
import { matchUrlToCandidates } from "@/lib/imageUrl";

type Body = {
  pageUrl: string;
  imageUrls: string[];
};

function scoreUrl(u: string) {
  const s = u.toLowerCase();
  let score = 0;
  if (/\.(png|jpg|jpeg|webp)(\?|$)/.test(s)) score += 2;
  if (s.includes("product") || s.includes("products")) score += 3;
  if (s.includes("featured") || s.includes("main") || s.includes("hero")) score += 2;
  if (s.includes("pack") || s.includes("packshot")) score += 2;
  if (s.includes("cdn.shopify.com")) score += 2;
  if (s.includes("icon") || s.includes("logo") || s.includes("sprite") || s.includes("favicon")) score -= 4;
  if (s.endsWith(".svg")) score -= 4;
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

  const ranked = [...urls]
    .map((u) => ({ u, s: scoreUrl(u) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.u)
    .slice(0, 10);

  const developer = [
    "You are classifying e-commerce images.",
    "Return STRICT JSON only.",
    "Goal: identify which images show ONLY the product (packshot) with minimal background, suitable as a clean reference for image-to-image generation.",
    "Also return a short reason per selected image.",
  ].join("\n");

  const userText = [
    `Page URL: ${body.pageUrl}`,
    "",
    "You will be shown up to 10 images from the page.",
    "Return JSON: { productOnlyUrls: [{ url, reason }], otherUrls: [url], confidence: \"low\"|\"medium\"|\"high\" }",
    "If none are packshots, return empty productOnlyUrls.",
    "CRITICAL: Every `url` you return MUST be copied EXACTLY from the image URLs listed in the user message (character-for-character). Do not invent, shorten, or paraphrase URLs.",
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({ v: 2, pageUrl: body.pageUrl, ranked });
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

    const { text } = await openaiResponsesTextWithImages({
      developer,
      userText,
      imageUrls: ranked,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
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
      const matched = matchUrlToCandidates(rawU, ranked, body.pageUrl);
      if (matched) {
        productOnlyUrls.push({
          url: matched,
          reason: typeof obj?.reason === "string" ? obj.reason : undefined,
        });
      }
    }

    if (productOnlyUrls.length === 0 && rawProductOnly.length > 0 && ranked.length > 0) {
      productOnlyUrls.push({
        url: ranked[0],
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
      ranked,
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

