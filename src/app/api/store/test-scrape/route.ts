export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  url: string;
  provider?: "claude" | "gpt";
};

/**
 * POST /api/store/test-scrape
 * Debug endpoint: runs the full extract → classify pipeline for a given URL
 * and returns a detailed report without creating any run or generating anything.
 *
 * Body: { url: string, provider?: "claude" | "gpt" }
 *
 * Example with curl:
 *   curl -X POST http://localhost:3000/api/store/test-scrape \
 *     -H "Content-Type: application/json" \
 *     -H "Cookie: <your-session-cookie>" \
 *     -d '{"url":"https://example-shop.com/products/my-product"}' | jq
 */
export async function POST(req: NextRequest) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const rawUrl = (body?.url ?? "").trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing `url`." }, { status: 400 });
  }

  try {
    new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  // Resolve base URL for internal fetch (works in both dev and prod)
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // Forward session cookie so auth is preserved on internal calls
  const cookie = req.headers.get("cookie") ?? "";
  const internalHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const timings: Record<string, number> = {};

  // ── Step 1: Extract ────────────────────────────────────────────────────
  const t1 = Date.now();
  let extractData: Record<string, unknown>;
  try {
    const extractRes = await fetch(`${baseUrl}/api/store/extract`, {
      method: "POST",
      headers: internalHeaders,
      body: JSON.stringify({ url: rawUrl }),
    });
    extractData = (await extractRes.json()) as Record<string, unknown>;
    timings.extractMs = Date.now() - t1;

    if (!extractRes.ok) {
      return NextResponse.json(
        { step: "extract", error: extractData, url: rawUrl, timings },
        { status: 502 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { step: "extract", error: String(err), url: rawUrl, timings },
      { status: 502 },
    );
  }

  const imageUrls = Array.isArray(extractData.images) ? (extractData.images as string[]) : [];
  const imagesMeta = extractData.imagesMeta ?? [];

  // ── Step 2: Classify ───────────────────────────────────────────────────
  const t2 = Date.now();
  let classifyData: Record<string, unknown> = {};
  let classifyError: string | null = null;

  if (imageUrls.length > 0) {
    try {
      const classifyRes = await fetch(`${baseUrl}/api/gpt/images-classify`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          pageUrl: extractData.url ?? rawUrl,
          imageUrls,
          imagesMeta,
          provider: body?.provider ?? "claude",
        }),
      });
      classifyData = (await classifyRes.json()) as Record<string, unknown>;
      timings.classifyMs = Date.now() - t2;

      if (!classifyRes.ok) {
        classifyError = JSON.stringify(classifyData);
      }
    } catch (err) {
      classifyError = String(err);
      timings.classifyMs = Date.now() - t2;
    }
  } else {
    timings.classifyMs = 0;
    classifyError = "No images found during extraction, classify skipped.";
  }

  timings.totalMs = (timings.extractMs ?? 0) + (timings.classifyMs ?? 0);

  // ── Build debug report ─────────────────────────────────────────────────
  const classify = (classifyData?.data ?? classifyData) as Record<string, unknown> | null;

  return NextResponse.json({
    url: extractData.url ?? rawUrl,
    timings,
    extract: {
      title: extractData.title ?? null,
      description: extractData.description ?? null,
      imageCount: imageUrls.length,
      // First 5 images with metadata for quick inspection
      imagesSample: Array.isArray(extractData.imagesMeta)
        ? (extractData.imagesMeta as unknown[]).slice(0, 5)
        : imageUrls.slice(0, 5),
    },
    classify: classifyError
      ? { error: classifyError }
      : {
          confidence: classify?.confidence ?? null,
          preFiltered: classify?.preFiltered ?? [],
          scored: classify?.scored ?? [],
          productOnlyUrls: classify?.productOnlyUrls ?? [],
          candidateUrls: classify?.candidateUrls ?? [],
          ranked: classify?.ranked ?? [],
          cached: classifyData?.cached ?? false,
        },
  });
}
