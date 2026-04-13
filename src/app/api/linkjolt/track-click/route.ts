import { NextResponse } from "next/server";

const LINKJOLT_CLICK_UPSTREAM = "https://www.linkjolt.io/api/track/click";

const DEFAULT_MERCHANT_ID = "NKdBH0Xt51wfjtEIZB5Zg";

function expectedMerchantId(): string {
  return (
    process.env.NEXT_PUBLIC_LINKJOLT_MERCHANT_ID?.trim() || DEFAULT_MERCHANT_ID
  );
}

/**
 * Same-origin relay for LinkJolt click tracking. The hosted tracking script posts to
 * linkjolt.io; some environments (extensions, SWs) force credentialed cross-origin
 * fetches, which breaks when LinkJolt responds with Access-Control-Allow-Origin: *.
 * Browser → this route (same origin) → LinkJolt (server-side, no CORS).
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

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    String((parsed as { merchantId?: unknown }).merchantId) !==
      expectedMerchantId()
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const upstream = await fetch(LINKJOLT_CLICK_UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  return new NextResponse(null, { status: upstream.ok ? 204 : 502 });
}
