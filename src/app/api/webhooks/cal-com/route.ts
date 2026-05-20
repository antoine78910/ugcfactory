import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import {
  markCalBookingCancelled,
  parseCalBookingFromWebhookBody,
  syncReminderRowFromCalBooking,
  trySendReminderImmediately,
  verifyCalComWebhookSignature,
} from "@/lib/onboardingCalReminders";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { serverLog } from "@/lib/serverLog";

export const runtime = "nodejs";

function calPayloadRoot(body: Record<string, unknown>): Record<string, unknown> {
  const p = body.payload;
  if (p && typeof p === "object" && p !== null) return p as Record<string, unknown>;
  return body;
}

function uidFromBody(body: Record<string, unknown>): string | null {
  const p = calPayloadRoot(body);
  const u = p.uid;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

/**
 * Cal.com → Settings → Webhooks → Subscriber URL: POST /api/webhooks/cal-com
 * Set the same secret in CAL_COM_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = getEnv("CAL_COM_WEBHOOK_SECRET")?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CAL_COM_WEBHOOK_SECRET not configured." }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig =
    req.headers.get("x-cal-signature-256") ??
    req.headers.get("X-Cal-Signature-256") ??
    "";

  if (!verifyCalComWebhookSignature(rawBody, sig, secret)) {
    serverLog("cal_com_webhook_bad_signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trigger = typeof json.triggerEvent === "string" ? json.triggerEvent : "";
  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    if (trigger === "BOOKING_CANCELLED") {
      const uid = uidFromBody(json);
      if (uid) await markCalBookingCancelled(admin, uid);
      return NextResponse.json({ ok: true });
    }

    if (trigger === "BOOKING_CREATED" || trigger === "BOOKING_RESCHEDULED") {
      const parsed = parseCalBookingFromWebhookBody(json);
      if (!parsed) {
        serverLog("cal_com_webhook_parse_skip", { trigger });
        return NextResponse.json({ ok: true, skipped: true });
      }
      const row = await syncReminderRowFromCalBooking(
        admin,
        {
          uid: parsed.uid,
          startIso: parsed.startIso,
          endIso: parsed.endIso,
          title: parsed.title,
          eventTypeSlug: parsed.eventTypeSlug,
          attendeeEmail: parsed.attendeeEmail,
          attendeeName: parsed.attendeeName,
        },
        trigger === "BOOKING_RESCHEDULED" ? "BOOKING_RESCHEDULED" : "BOOKING_CREATED",
      );
      if (row) await trySendReminderImmediately(admin, row.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: trigger });
  } catch (e) {
    serverLog("cal_com_webhook_error", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
