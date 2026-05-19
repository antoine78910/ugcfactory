export const runtime = "nodejs";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordStartLinkClick } from "@/lib/analytics/startLinkServer";
import {
  START_LINK_VISITOR_COOKIE,
  START_LINK_VISITOR_MAX_AGE_SEC,
  newStartLinkVisitorId,
} from "@/lib/analytics/startLinkRef";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export async function POST() {
  const store = await cookies();
  let visitorId = store.get(START_LINK_VISITOR_COOKIE)?.value?.trim() ?? "";
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = newStartLinkVisitorId();

  const admin = createSupabaseServiceClient();
  if (admin) {
    try {
      await recordStartLinkClick(admin, visitorId);
    } catch (e) {
      console.error("[start-link/click]", e);
    }
  }

  const res = NextResponse.json({ ok: true, visitorId });
  if (isNewVisitor) {
    res.cookies.set(START_LINK_VISITOR_COOKIE, visitorId, {
      path: "/",
      maxAge: START_LINK_VISITOR_MAX_AGE_SEC,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
