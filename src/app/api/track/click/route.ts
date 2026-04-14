import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy no-op endpoint: accepts JSON POST and returns 204 (optional client pings).
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
