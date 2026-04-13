import { NextResponse } from "next/server";

const LINKJOLT_CLICK_UPSTREAM = "https://www.linkjolt.io/api/track/click";

const DEFAULT_MERCHANT_ID = "NKdBH0Xt51wfjtEIZB5Zg";

export const dynamic = "force-dynamic";

function expectedMerchantId(): string {
  return (
    process.env.NEXT_PUBLIC_LINKJOLT_MERCHANT_ID?.trim() || DEFAULT_MERCHANT_ID
  );
}

function merchantIdFromPayload(parsed: Record<string, unknown>): string {
  const raw =
    parsed.merchantId ?? parsed.merchant_id ?? parsed.merchantID ?? "";
  return String(raw);
}

/**
 * Same-origin relay for LinkJolt click tracking. The hosted tracking script posts to
 * linkjolt.io; some environments (extensions, SWs) force credentialed cross-origin
 * fetches, which breaks when LinkJolt responds with Access-Control-Allow-Origin: *.
 * Browser → this route (same origin) → LinkJolt (server-side, no CORS).
 *
 * Upstream may still return 5xx (vendor-side). Attribution is already stored in
 * localStorage/cookies client-side before the beacon runs, so we respond 204 after
 * a valid relay attempt to avoid noisy 502s in the console.
 */
export async function POST(req: Request) {
  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.byteLength === 0 || body.byteLength > 32_000) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  if (typeof parsed !== "object" || parsed === null) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const record = parsed as Record<string, unknown>;
  if (merchantIdFromPayload(record) !== expectedMerchantId()) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": req.headers.get("user-agent")?.slice(0, 512) || "LinkJoltProxy/1",
  };
  const xf = req.headers.get("x-forwarded-for");
  if (xf) forwardHeaders["X-Forwarded-For"] = xf.slice(0, 1024);
  const referer = req.headers.get("referer");
  if (referer) forwardHeaders.Referer = referer.slice(0, 2048);

  const payloadUrl = typeof record.url === "string" ? record.url : "";
  if (payloadUrl && !referer) {
    try {
      forwardHeaders.Referer = new URL(payloadUrl).href.slice(0, 2048);
    } catch {
      /* ignore */
    }
  }

  try {
    const upstream = await fetch(LINKJOLT_CLICK_UPSTREAM, {
      method: "POST",
      headers: forwardHeaders,
      body,
    });
    if (!upstream.ok) {
      const snippet = (await upstream.text()).slice(0, 500);
      console.error(
        "[linkjolt/track-click] upstream failed",
        upstream.status,
        snippet,
      );
    }
  } catch (err) {
    console.error("[linkjolt/track-click] upstream fetch error", err);
  }

  return new NextResponse(null, { status: 204 });
}
