import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * LinkJolt `tracking.js` posts here (fetch + sendBeacon) to record affiliate clicks server-side.
 * Body: { trackingCode, affiliateId, clickId?, referrer, url, merchantId }
 * sendBeacon sends JSON as text/plain — we parse both JSON and raw text.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!raw.trim()) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return new NextResponse(null, { status: 204 });
}
