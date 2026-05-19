import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { recordStartLinkClick } from "@/lib/analytics/startLinkServer";
import {
  START_LINK_COOKIE,
  START_LINK_VISITOR_COOKIE,
  START_LINK_VISITOR_MAX_AGE_SEC,
  newStartLinkVisitorId,
} from "@/lib/analytics/startLinkRef";
import { marketingOrigin } from "@/lib/marketingOrigin";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const cookieOptions = {
  path: "/",
  maxAge: START_LINK_VISITOR_MAX_AGE_SEC,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function marketingStartRedirectUrl(searchParams: URLSearchParams): string {
  const target = new URL(`${marketingOrigin()}/`);
  searchParams.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  return target.toString();
}

/**
 * GET /start — record click, set attribution cookies, redirect to marketing LP.
 */
export async function startLinkRedirectResponse(req: NextRequest): Promise<NextResponse> {
  const store = req.cookies;
  let visitorId = store.get(START_LINK_VISITOR_COOKIE)?.value?.trim() ?? "";
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = newStartLinkVisitorId();

  const admin = createSupabaseServiceClient();
  if (admin) {
    try {
      await recordStartLinkClick(admin, visitorId);
    } catch (e) {
      console.error("[start]", e);
    }
  }

  const res = NextResponse.redirect(marketingStartRedirectUrl(req.nextUrl.searchParams), 307);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (isNewVisitor) {
    res.cookies.set(START_LINK_VISITOR_COOKIE, visitorId, cookieOptions);
  }
  res.cookies.set(START_LINK_COOKIE, "1", cookieOptions);

  return res;
}
