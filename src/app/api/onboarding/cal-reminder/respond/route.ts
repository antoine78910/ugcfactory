import { NextResponse } from "next/server";

import {
  notifyOwnerAttendeeConfirmed,
  notifyOwnerAttendeeDeclined,
} from "@/lib/onboardingCalReminders";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function htmlPage(body: string, title: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 28px; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; }
    p { color: #a1a1aa; font-size: 0.95rem; line-height: 1.5; margin: 0; }
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

/**
 * One-click RSVP from the reminder email (yes / no).
 * Notifies ONBOARDING_CAL_OWNER_EMAIL on "yes" (and on "no" for visibility).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") ?? "").trim();
  const decisionRaw = (searchParams.get("decision") ?? "").trim().toLowerCase();
  let decision: "yes" | "no" | null = null;
  if (decisionRaw === "yes" || decisionRaw === "y" || decisionRaw === "1") decision = "yes";
  else if (decisionRaw === "no" || decisionRaw === "n" || decisionRaw === "0") decision = "no";

  if (!token || token.length < 16) {
    return new NextResponse(htmlPage("<h1>Invalid link</h1><p>This confirmation link is missing or invalid.</p>", "Invalid link"), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!decision) {
    return new NextResponse(
      htmlPage("<h1>Choose an option</h1><p>Open the <strong>Yes</strong> or <strong>No</strong> button from your reminder email.</p>", "RSVP"),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return new NextResponse(htmlPage("<h1>Unavailable</h1><p>Service is temporarily unavailable. Please try again later.</p>", "Error"), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const now = new Date().toISOString();

  const { data: row, error: loadErr } = await admin
    .from("onboarding_cal_reminders")
    .select("*")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (loadErr || !row) {
    return new NextResponse(htmlPage("<h1>Invalid link</h1><p>This confirmation link is no longer valid.</p>", "Invalid link"), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (decision === "yes") {
    if (row.attendee_confirmed_at) {
      return new NextResponse(
        htmlPage(
          "<h1>Thanks — you’re all set</h1><p>We already have your confirmation for this call.</p>",
          "Confirmed",
        ),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    const { error } = await admin
      .from("onboarding_cal_reminders")
      .update({
        attendee_confirmed_at: now,
        attendee_declined_at: null,
        updated_at: now,
      })
      .eq("id", row.id);

    if (error) {
      return new NextResponse(htmlPage("<h1>Something went wrong</h1><p>Could not record your response.</p>", "Error"), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const updated = {
      ...row,
      attendee_confirmed_at: now,
      attendee_declined_at: null,
    } as Parameters<typeof notifyOwnerAttendeeConfirmed>[0];

    void notifyOwnerAttendeeConfirmed(updated);

    return new NextResponse(
      htmlPage(
        "<h1>Thanks, you’re confirmed</h1><p>We’ll see you on the call. A calendar invite should already be in your inbox.</p>",
        "Confirmed",
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  if (row.attendee_declined_at) {
    return new NextResponse(
      htmlPage("<h1>Thanks — noted</h1><p>We’ve already recorded that you can’t attend this time.</p>", "Noted"),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const { error: decErr } = await admin
    .from("onboarding_cal_reminders")
    .update({
      attendee_declined_at: now,
      attendee_confirmed_at: null,
      updated_at: now,
    })
    .eq("id", row.id);

  if (decErr) {
    return new NextResponse(htmlPage("<h1>Something went wrong</h1><p>Could not record your response.</p>", "Error"), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const declinedRow = {
    ...row,
    attendee_declined_at: now,
    attendee_confirmed_at: null,
  } as Parameters<typeof notifyOwnerAttendeeDeclined>[0];

  void notifyOwnerAttendeeDeclined(declinedRow);

  return new NextResponse(
    htmlPage(
      "<h1>Thanks for letting us know</h1><p>We’ve recorded that you can’t make this slot. You can book another time from the app if you’d like.</p>",
      "Noted",
    ),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
