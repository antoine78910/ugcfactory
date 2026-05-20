import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { brevoSendTransactionalEmail } from "@/lib/brevo";
import { serverLog } from "@/lib/serverLog";
import { studioAppOrigin } from "@/lib/studioAppOrigin";

const REMINDER_HOURS_BEFORE = 12;

export type OnboardingCalReminderRow = {
  id: string;
  cal_booking_uid: string;
  event_type_slug: string | null;
  attendee_email: string;
  attendee_name: string | null;
  event_title: string | null;
  start_time: string;
  end_time: string | null;
  reminder_send_at: string;
  reminder_sent_at: string | null;
  confirmation_token: string;
  attendee_confirmed_at: string | null;
  attendee_declined_at: string | null;
  cal_cancelled_at: string | null;
};

export function verifyCalComWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  const s = secret.trim();
  if (!s || signatureHeader == null) return false;
  const hmac = createHmac("sha256", s);
  hmac.update(rawBody, "utf8");
  const digestHex = hmac.digest("hex");
  let received = signatureHeader.trim();
  if (received.toLowerCase().startsWith("sha256=")) received = received.slice(7).trim();
  try {
    const a = Buffer.from(digestHex, "hex");
    const b = Buffer.from(received, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function calPayloadRoot(body: Record<string, unknown>): Record<string, unknown> {
  const p = body.payload;
  if (p && typeof p === "object" && p !== null) return p as Record<string, unknown>;
  return body;
}

function firstString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function attendeeFromPayload(p: Record<string, unknown>): { email: string; name: string | null } | null {
  const attendees = p.attendees;
  if (!Array.isArray(attendees) || !attendees.length) return null;
  const a0 = attendees[0];
  if (!a0 || typeof a0 !== "object") return null;
  const rec = a0 as Record<string, unknown>;
  const email = firstString(rec.email);
  if (!email) return null;
  const name = firstString(rec.name);
  return { email, name };
}

export function parseCalBookingFromWebhookBody(body: Record<string, unknown>): {
  triggerEvent: string;
  uid: string;
  startIso: string;
  endIso: string | null;
  title: string | null;
  eventTypeSlug: string | null;
  attendeeEmail: string;
  attendeeName: string | null;
} | null {
  const trigger = firstString(body.triggerEvent);
  if (!trigger) return null;
  const p = calPayloadRoot(body);
  const uid = firstString(p.uid);
  const startIso = firstString(p.startTime);
  if (!uid || !startIso) return null;
  const att = attendeeFromPayload(p);
  if (!att) return null;
  const title =
    firstString(p.eventTitle) ??
    firstString(p.title) ??
    null;
  const eventTypeSlug = firstString(p.type);
  return {
    triggerEvent: trigger,
    uid,
    startIso,
    endIso: firstString(p.endTime),
    title,
    eventTypeSlug,
    attendeeEmail: att.email,
    attendeeName: att.name,
  };
}

function reminderSendAtFromStart(startMs: number): string {
  const t = startMs - REMINDER_HOURS_BEFORE * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

function allowedEventSlug(eventTypeSlug: string | null): boolean {
  const raw = process.env.CAL_ONBOARDING_REMINDER_EVENT_SLUGS?.trim();
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!eventTypeSlug) return false;
  return allowed.has(eventTypeSlug);
}

function ownerNotificationEmail(): string {
  return process.env.ONBOARDING_CAL_OWNER_EMAIL?.trim() || "anto.delbos@gmail.com";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSlot(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export async function syncReminderRowFromCalBooking(
  admin: SupabaseClient,
  booking: {
    uid: string;
    startIso: string;
    endIso: string | null;
    title: string | null;
    eventTypeSlug: string | null;
    attendeeEmail: string;
    attendeeName: string | null;
  },
  trigger: "BOOKING_CREATED" | "BOOKING_RESCHEDULED",
): Promise<OnboardingCalReminderRow | null> {
  if (!allowedEventSlug(booking.eventTypeSlug)) {
    serverLog("onboarding_cal_reminder_skip_slug", { slug: booking.eventTypeSlug });
    return null;
  }

  const startMs = Date.parse(booking.startIso);
  if (!Number.isFinite(startMs)) return null;

  const reminderSend = reminderSendAtFromStart(startMs);
  const now = new Date().toISOString();
  const endIso =
    booking.endIso && Number.isFinite(Date.parse(booking.endIso))
      ? new Date(Date.parse(booking.endIso)).toISOString()
      : null;

  const { data: existing, error: selErr } = await admin
    .from("onboarding_cal_reminders")
    .select("*")
    .eq("cal_booking_uid", booking.uid)
    .maybeSingle();

  if (selErr) {
    serverLog("onboarding_cal_reminder_select_error", { error: selErr.message });
    return null;
  }

  const base = existing as OnboardingCalReminderRow | null;

  if (base) {
    if (base.reminder_sent_at && trigger === "BOOKING_RESCHEDULED") {
      const { data: updated, error } = await admin
        .from("onboarding_cal_reminders")
        .update({
          start_time: new Date(startMs).toISOString(),
          end_time: endIso,
          event_title: booking.title,
          event_type_slug: booking.eventTypeSlug,
          attendee_email: booking.attendeeEmail,
          attendee_name: booking.attendeeName,
          updated_at: now,
        })
        .eq("id", base.id)
        .select()
        .maybeSingle();
      if (error) {
        serverLog("onboarding_cal_reminder_update_error", { error: error.message });
        return null;
      }
      return updated as OnboardingCalReminderRow;
    }

    const patch: Record<string, unknown> = {
      start_time: new Date(startMs).toISOString(),
      end_time: endIso,
      event_title: booking.title,
      event_type_slug: booking.eventTypeSlug,
      attendee_email: booking.attendeeEmail,
      attendee_name: booking.attendeeName,
      updated_at: now,
    };

    if (!base.reminder_sent_at) {
      patch.reminder_send_at = reminderSend;
      if (trigger === "BOOKING_RESCHEDULED") {
        patch.attendee_confirmed_at = null;
        patch.attendee_declined_at = null;
      }
    }

    const { data: updated, error } = await admin
      .from("onboarding_cal_reminders")
      .update(patch)
      .eq("id", base.id)
      .select()
      .maybeSingle();
    if (error) {
      serverLog("onboarding_cal_reminder_update_error", { error: error.message });
      return null;
    }
    return updated as OnboardingCalReminderRow;
  }

  const token = randomBytes(24).toString("hex");
  const { data: inserted, error: insertErr } = await admin
    .from("onboarding_cal_reminders")
    .insert({
      cal_booking_uid: booking.uid,
      event_type_slug: booking.eventTypeSlug,
      attendee_email: booking.attendeeEmail,
      attendee_name: booking.attendeeName,
      event_title: booking.title,
      start_time: new Date(startMs).toISOString(),
      end_time: endIso,
      reminder_send_at: reminderSend,
      reminder_sent_at: null,
      confirmation_token: token,
      attendee_confirmed_at: null,
      attendee_declined_at: null,
      cal_cancelled_at: null,
      updated_at: now,
    })
    .select()
    .maybeSingle();

  if (insertErr) {
    serverLog("onboarding_cal_reminder_insert_error", { error: insertErr.message });
    return null;
  }
  return inserted as OnboardingCalReminderRow;
}

export async function markCalBookingCancelled(admin: SupabaseClient, calBookingUid: string): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("onboarding_cal_reminders")
    .update({ cal_cancelled_at: now, updated_at: now })
    .eq("cal_booking_uid", calBookingUid);
}

export async function sendReminderEmailToAttendee(row: OnboardingCalReminderRow): Promise<boolean> {
  const base = studioAppOrigin();
  const yesUrl = `${base}/api/onboarding/cal-reminder/respond?token=${encodeURIComponent(row.confirmation_token)}&decision=yes`;
  const noUrl = `${base}/api/onboarding/cal-reminder/respond?token=${encodeURIComponent(row.confirmation_token)}&decision=no`;
  const slot = formatSlot(row.start_time);
  const title = row.event_title?.trim() || "Your onboarding call";
  const name = row.attendee_name?.trim() || "there";

  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>This is a quick reminder about your <strong>${escapeHtml(title)}</strong> scheduled for <strong>${escapeHtml(slot)}</strong>.</p>
    <p>Will you still join this call? Please tap one of the buttons below so we know whether to expect you.</p>
    <p style="margin:24px 0;">
      <a href="${yesUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Yes, I’ll be there</a>
      &nbsp;&nbsp;
      <a href="${noUrl}" style="display:inline-block;padding:10px 18px;background:#27272a;color:#fafafa;text-decoration:none;border-radius:8px;font-weight:600;border:1px solid #3f3f46;">No, I can’t make it</a>
    </p>
    <p style="font-size:13px;color:#71717a;">If the buttons don’t work, copy this link to confirm: ${escapeHtml(yesUrl)}</p>
  `;

  return brevoSendTransactionalEmail({
    to: [{ email: row.attendee_email, name: row.attendee_name ?? undefined }],
    subject: `Quick check: still joining your call on ${slot}?`,
    htmlContent: html,
    senderName: "Youry",
  });
}

export async function notifyOwnerAttendeeConfirmed(row: OnboardingCalReminderRow): Promise<boolean> {
  const owner = ownerNotificationEmail();
  const slot = formatSlot(row.start_time);
  const who = row.attendee_name?.trim()
    ? `${row.attendee_name.trim()} <${row.attendee_email}>`
    : row.attendee_email;
  const html = `
    <h2>Onboarding call confirmed</h2>
    <p><strong>${escapeHtml(who)}</strong> confirmed they will attend.</p>
    <p><strong>Time:</strong> ${escapeHtml(slot)}</p>
    <p><strong>Event:</strong> ${escapeHtml(row.event_title?.trim() || "Onboarding")}</p>
  `;
  return brevoSendTransactionalEmail({
    to: [{ email: owner }],
    subject: `Onboarding call confirmed — ${row.attendee_email}`,
    htmlContent: html,
    replyTo: { email: row.attendee_email },
    senderName: "Youry",
  });
}

export async function notifyOwnerAttendeeDeclined(row: OnboardingCalReminderRow): Promise<boolean> {
  const owner = ownerNotificationEmail();
  const slot = formatSlot(row.start_time);
  const who = row.attendee_name?.trim()
    ? `${row.attendee_name.trim()} <${row.attendee_email}>`
    : row.attendee_email;
  const html = `
    <h2>Onboarding call declined</h2>
    <p><strong>${escapeHtml(who)}</strong> indicated they can’t make the scheduled call.</p>
    <p><strong>Was scheduled for:</strong> ${escapeHtml(slot)}</p>
  `;
  return brevoSendTransactionalEmail({
    to: [{ email: owner }],
    subject: `Onboarding call — can’t attend — ${row.attendee_email}`,
    htmlContent: html,
    replyTo: { email: row.attendee_email },
    senderName: "Youry",
  });
}

/** Send all reminders that are due (and booking still in the future). Returns number sent. */
export async function processDueOnboardingCalReminders(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ processed: number; errors: number }> {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 25));
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("onboarding_cal_reminders")
    .select("*")
    .is("reminder_sent_at", null)
    .is("cal_cancelled_at", null)
    .lte("reminder_send_at", nowIso)
    .gt("start_time", nowIso)
    .order("reminder_send_at", { ascending: true })
    .limit(limit);

  if (error) {
    serverLog("onboarding_cal_reminder_cron_select_error", { error: error.message });
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;
  for (const row of (rows ?? []) as OnboardingCalReminderRow[]) {
    const ok = await sendReminderEmailToAttendee(row);
    if (!ok) {
      errors += 1;
      continue;
    }
    const { error: upErr } = await admin
      .from("onboarding_cal_reminders")
      .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("reminder_sent_at", null);
    if (upErr) {
      serverLog("onboarding_cal_reminder_mark_sent_error", { error: upErr.message, id: row.id });
      errors += 1;
      continue;
    }
    processed += 1;
  }
  return { processed, errors };
}

/** If the booking is close enough that T-12h is already past, send the reminder immediately (once). */
export async function trySendReminderImmediately(admin: SupabaseClient, rowId: string): Promise<void> {
  const { data: row, error } = await admin
    .from("onboarding_cal_reminders")
    .select("*")
    .eq("id", rowId)
    .maybeSingle();

  if (error || !row) return;
  const r = row as OnboardingCalReminderRow;
  const now = Date.now();
  if (r.reminder_sent_at || r.cal_cancelled_at) return;
  const sendAt = Date.parse(r.reminder_send_at);
  if (!Number.isFinite(sendAt) || sendAt > now) return;
  const start = Date.parse(r.start_time);
  if (!Number.isFinite(start) || start <= now) return;

  const ok = await sendReminderEmailToAttendee(r);
  if (!ok) return;
  await admin
    .from("onboarding_cal_reminders")
    .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", r.id)
    .is("reminder_sent_at", null);
}
