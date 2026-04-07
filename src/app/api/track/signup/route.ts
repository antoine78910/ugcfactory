export const runtime = "nodejs";

/**
 * POST /api/track/signup
 * Called client-side after a successful email/password signup.
 * Creates/updates the Brevo contact and fires the "signup" event.
 * Body: { email: string }
 */

import { NextResponse } from "next/server";
import { brevoUpsertContact, brevoTrackEvent } from "@/lib/brevo";

export async function POST(req: Request) {
  let body: { email?: string } = {};
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
  }

  await brevoUpsertContact(email, {
    SIGNUP_DATE: new Date().toISOString().slice(0, 10),
  });

  await brevoTrackEvent(email, "signup", {
    eventProperties: { source: "app", method: "email_password" },
  });

  return NextResponse.json({ ok: true });
}
