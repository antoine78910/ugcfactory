/**
 * Scheduled job: backfill queue if webhooks failed, send due emails via Resend, mark sent.
 * Invoke from Supabase Dashboard → Edge Functions → Schedules (e.g. every hour),
 * or call manually with Authorization: Bearer <CRON_SECRET> if CRON_SECRET is set.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emailHtml(bookingUrl: string) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi there,</p>
  <p>Thanks for signing up. We would love to help you get the most out of the product.</p>
  <p><a href="${bookingUrl}" style="color:#6d28d9;font-weight:600">Book a quick call with us</a> at a time that works for you.</p>
  <p>Thanks,<br />The team</p>
</body>
</html>`;
}

Deno.serve(async (req) => {
  // Set CRON_SECRET in function secrets and send: Authorization: Bearer <CRON_SECRET>
  // (or configure the same header on a Supabase scheduled invocation / external cron).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("signup-call-invite-cron: CRON_SECRET is not set");
    return json(500, { error: "CRON_SECRET not configured" });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return json(401, { error: "Unauthorized" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const bookingUrl = Deno.env.get("CALL_INVITE_BOOKING_URL");

  if (!url || !serviceKey) {
    console.error("signup-call-invite-cron: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json(500, { error: "Server misconfigured" });
  }
  if (!resendKey || !from || !bookingUrl) {
    console.error("signup-call-invite-cron: missing RESEND_API_KEY, RESEND_FROM_EMAIL, or CALL_INVITE_BOOKING_URL");
    return json(500, { error: "Resend not configured" });
  }

  const supabase = createClient(url, serviceKey);

  const { error: backfillErr } = await supabase.rpc("backfill_signup_call_invite_queue");
  if (backfillErr) {
    console.error("signup-call-invite-cron: backfill error", backfillErr);
    return json(500, { error: backfillErr.message });
  }

  const now = new Date().toISOString();
  const { data: due, error: dueErr } = await supabase
    .from("signup_call_invite_queue")
    .select("user_id, email")
    .lte("send_after", now)
    .is("sent_at", null)
    .limit(50);

  if (dueErr) {
    console.error("signup-call-invite-cron: select due error", dueErr);
    return json(500, { error: dueErr.message });
  }

  const rows = due ?? [];
  let sent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const to = (row.email ?? "").trim();
    if (!to) {
      errors.push(`empty email for ${row.user_id}`);
      continue;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Book a quick call with us",
        html: emailHtml(bookingUrl),
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("signup-call-invite-cron: Resend error", res.status, t);
      errors.push(`resend ${row.user_id}: ${res.status}`);
      continue;
    }

    const { error: updErr } = await supabase
      .from("signup_call_invite_queue")
      .update({ sent_at: now })
      .eq("user_id", row.user_id)
      .is("sent_at", null);

    if (updErr) {
      console.error("signup-call-invite-cron: update sent_at error", updErr);
      errors.push(`update ${row.user_id}: ${updErr.message}`);
      continue;
    }
    sent += 1;
  }

  return json(200, {
    ok: true,
    pending_checked: rows.length,
    sent,
    errors: errors.length ? errors : undefined,
  });
});
