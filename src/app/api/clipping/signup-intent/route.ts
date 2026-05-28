export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applyClippingSignupIntent } from "@/lib/analytics/clippingSignupIntent";

/** Record clipping signup intent without leaving the page (e.g. Link to Ad popup on /clipping/tools). */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  await applyClippingSignupIntent(req, res);
  return res;
}
