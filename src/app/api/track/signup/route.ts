export const runtime = "nodejs";

/**
 * POST /api/track/signup
 * Called client-side after a successful email/password signup.
 * Creates/updates the Brevo contact and fires the "signup" event.
 * Body: { email: string, userId?: string, firstName?: string, clickId?: string }
 * Dub: `dub_id` cookie or `clickId` in body → server `track.lead` when `DUB_API_KEY` is set.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { brevoUpsertContact, brevoTrackEvent } from "@/lib/brevo";
import { normalizeDubClickId } from "@/lib/dub/clickId";
import { trackDubLeadServer } from "@/lib/dub/trackLeadServer";

export async function POST(req: Request) {
  const traceId = `signup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  console.log("[DubTrace] /api/track/signup START", { traceId });

  let body: { email?: string; userId?: string; firstName?: string; clickId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    console.warn("[DubTrace] /api/track/signup invalid json body", { traceId });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    console.warn("[DubTrace] /api/track/signup missing email", { traceId });
    return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
  }

  await brevoUpsertContact(email, {
    SIGNUP_DATE: new Date().toISOString().slice(0, 10),
  });

  await brevoTrackEvent(email, "signup", {
    eventProperties: { source: "app", method: "email_password" },
  });

  const cookieStore = await cookies();
  const clickFromCookie = normalizeDubClickId(cookieStore.get("dub_id")?.value);
  const clickFromBody = normalizeDubClickId(body.clickId);
  const clickId = clickFromCookie || clickFromBody;

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const customerExternalId = userId || email;
  const mode = clickId ? "async" : "deferred";

  console.log("[Dub] /api/track/signup", {
    traceId,
    customerExternalId,
    clickFromCookie: clickFromCookie || "(none)",
    clickFromBody: clickFromBody || "(none)",
    clickId: clickId || "(none)",
    mode,
  });

  // Await the Dub lead event so Vercel doesn't terminate the function before it completes.
  // With clickId → direct attribution to the affiliate click.
  // Without clickId → deferred mode: Dub retroactively matches a click if found later.
  await trackDubLeadServer({
    clickId: clickId || "",
    customerExternalId,
    customerEmail: email,
    customerName: firstName || undefined,
    eventName: "Sign up",
    mode,
  });

  console.log("[DubTrace] /api/track/signup DONE", {
    traceId,
    customerExternalId,
    mode,
  });

  return NextResponse.json({ ok: true });
}
