export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";

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
  ].join("\n");

  try {
    const { text } = await openaiResponsesTextWithImages({
      developer,
      userText,
      imageUrls: ranked,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        ranked,
        productOnlyUrls: Array.isArray(parsed?.productOnlyUrls) ? parsed.productOnlyUrls : [],
        otherUrls: Array.isArray(parsed?.otherUrls) ? parsed.otherUrls : [],
        confidence: String(parsed?.confidence ?? "low"),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

