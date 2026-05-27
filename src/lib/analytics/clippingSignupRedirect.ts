import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyClippingSignupIntent,
  clippingSignupPagePath,
} from "@/lib/analytics/clippingSignupIntent";

/**
 * GET /start/clipping — track clipping-template signup intent, set cookies, redirect to signup.
 * After registration the user lands on Link to Ad (not onboarding).
 */
export async function clippingSignupRedirectResponse(req: NextRequest): Promise<NextResponse> {
  const target = new URL(clippingSignupPagePath(req), req.nextUrl.origin);
  const res = NextResponse.redirect(target.toString(), 307);
  await applyClippingSignupIntent(req, res);
  return res;
}
