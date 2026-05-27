import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { recordClippingSignupClick } from "@/lib/analytics/clippingSignupServer";
import {
  CLIPPING_SIGNUP_ENTRY_COOKIE,
  CLIPPING_SIGNUP_REDIRECT_PATH,
  CLIPPING_SIGNUP_VISITOR_COOKIE,
  CLIPPING_SIGNUP_VISITOR_MAX_AGE_SEC,
  newClippingSignupVisitorId,
} from "@/lib/analytics/clippingSignupRef";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const cookieOptions = {
  path: "/",
  maxAge: CLIPPING_SIGNUP_VISITOR_MAX_AGE_SEC,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function clippingSignupUrl(req: NextRequest): string {
  const origin = req.nextUrl.origin;
  const redirect = `${CLIPPING_SIGNUP_REDIRECT_PATH}`;
  const target = new URL("/signup", origin);
  target.searchParams.set("redirect", redirect);
  target.searchParams.set("source", "clipping_template");
  req.nextUrl.searchParams.forEach((value, key) => {
    if (key === "redirect" || key === "source") return;
    target.searchParams.set(key, value);
  });
  return target.toString();
}

/**
 * GET /start/clipping — track clipping-template signup intent, set cookies, redirect to signup.
 * After registration the user lands on Link to Ad (not onboarding).
 */
export async function clippingSignupRedirectResponse(req: NextRequest): Promise<NextResponse> {
  const store = req.cookies;
  let visitorId = store.get(CLIPPING_SIGNUP_VISITOR_COOKIE)?.value?.trim() ?? "";
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = newClippingSignupVisitorId();

  const admin = createSupabaseServiceClient();
  if (admin) {
    try {
      await recordClippingSignupClick(admin, visitorId);
    } catch (e) {
      console.error("[start/clipping]", e);
    }
  }

  const res = NextResponse.redirect(clippingSignupUrl(req), 307);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (isNewVisitor) {
    res.cookies.set(CLIPPING_SIGNUP_VISITOR_COOKIE, visitorId, cookieOptions);
  }
  res.cookies.set(CLIPPING_SIGNUP_ENTRY_COOKIE, "1", cookieOptions);

  return res;
}
