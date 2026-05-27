import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { recordClippingSignupClick } from "@/lib/analytics/clippingSignupServer";
import {
  CLIPPING_SIGNUP_ENTRY_COOKIE,
  CLIPPING_SIGNUP_REDIRECT_PATH,
  CLIPPING_SIGNUP_VISITOR_COOKIE,
  CLIPPING_SIGNUP_VISITOR_MAX_AGE_SEC,
  newClippingSignupVisitorId,
} from "@/lib/analytics/clippingSignupRef";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export const clippingSignupCookieOptions = {
  path: "/",
  maxAge: CLIPPING_SIGNUP_VISITOR_MAX_AGE_SEC,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export function clippingSignupPageSearchParams(req?: NextRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set("redirect", CLIPPING_SIGNUP_REDIRECT_PATH);
  params.set("source", "clipping_template");
  req?.nextUrl.searchParams.forEach((value, key) => {
    if (key === "redirect" || key === "source") return;
    params.set(key, value);
  });
  return params;
}

export function clippingSignupPagePath(req?: NextRequest): string {
  return `/signup?${clippingSignupPageSearchParams(req).toString()}`;
}

export function clippingSigninPagePath(req?: NextRequest): string {
  const params = clippingSignupPageSearchParams(req);
  return `/signin?${params.toString()}`;
}

type ClippingIntentResult = {
  visitorId: string;
  isNewVisitor: boolean;
};

/** Track clipping-template signup intent and attach attribution cookies to `res`. */
export async function applyClippingSignupIntent(
  req: NextRequest,
  res: NextResponse,
): Promise<ClippingIntentResult> {
  const store = req.cookies;
  let visitorId = store.get(CLIPPING_SIGNUP_VISITOR_COOKIE)?.value?.trim() ?? "";
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = newClippingSignupVisitorId();

  const admin = createSupabaseServiceClient();
  if (admin) {
    try {
      await recordClippingSignupClick(admin, visitorId);
    } catch (e) {
      console.error("[clipping-signup-intent]", e);
    }
  }

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (isNewVisitor) {
    res.cookies.set(CLIPPING_SIGNUP_VISITOR_COOKIE, visitorId, clippingSignupCookieOptions);
  }
  res.cookies.set(CLIPPING_SIGNUP_ENTRY_COOKIE, "1", clippingSignupCookieOptions);

  return { visitorId, isNewVisitor };
}
