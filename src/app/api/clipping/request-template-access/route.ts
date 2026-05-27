export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readClippingSignupVisitorIdFromRequest } from "@/lib/analytics/clippingSignupFromRequest";
import { applyClippingSignupIntent } from "@/lib/analytics/clippingSignupIntent";
import { recordClippingTemplateAccessRequest } from "@/lib/analytics/clippingTemplateAccessRequest";
import { newClippingSignupVisitorId } from "@/lib/analytics/clippingSignupRef";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/** Submit email from clipping hub — track in admin + enable template toggle automatically. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable. Try again later." }, { status: 503 });
  }

  let visitorId = await readClippingSignupVisitorIdFromRequest();
  if (!visitorId) visitorId = newClippingSignupVisitorId();

  try {
    await recordClippingTemplateAccessRequest(admin, visitorId, email);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save your request.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, email });
  await applyClippingSignupIntent(req, res);
  return res;
}
