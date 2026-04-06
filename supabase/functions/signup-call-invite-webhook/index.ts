/**
 * Database Webhook target: INSERT on public.profiles → enqueue deferred call-invite email.
 * Configure in Supabase: Database → Webhooks → INSERT on public.profiles → this function URL.
 * Optional: set custom header X-Webhook-Secret to match WEBHOOK_SECRET in function secrets.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DELAY_MS = 3 * 24 * 60 * 60 * 1000;

type DbWebhookPayload = {
  type?: string;
  eventType?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    email?: string;
    created_at?: string;
  };
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const header = req.headers.get("x-webhook-secret");
    if (header !== webhookSecret) {
      return json(401, { error: "Unauthorized" });
    }
  }

  let payload: DbWebhookPayload;
  try {
    payload = (await req.json()) as DbWebhookPayload;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const event = payload.type ?? payload.eventType ?? "";
  const table = payload.table ?? "";
  if (!String(event).toUpperCase().includes("INSERT") || table !== "profiles") {
    return json(200, { ok: true, skipped: true, reason: "not_profiles_insert" });
  }

  const record = payload.record;
  const userId = record?.id;
  const email = (record?.email ?? "").trim();
  if (!userId || !email) {
    return json(200, { ok: true, skipped: true, reason: "missing_id_or_email" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("signup-call-invite-webhook: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json(500, { error: "Server misconfigured" });
  }

  const supabase = createClient(url, serviceKey);

  const { data: existing, error: selErr } = await supabase
    .from("signup_call_invite_queue")
    .select("sent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("signup-call-invite-webhook: select error", selErr);
    return json(500, { error: selErr.message });
  }
  if (existing?.sent_at) {
    return json(200, { ok: true, skipped: true, reason: "already_sent" });
  }

  const base = record.created_at ? new Date(record.created_at) : new Date();
  const sendAfter = new Date(base.getTime() + DELAY_MS);

  const { error: upsertErr } = await supabase.from("signup_call_invite_queue").upsert(
    {
      user_id: userId,
      email,
      send_after: sendAfter.toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertErr) {
    console.error("signup-call-invite-webhook: upsert error", upsertErr);
    return json(500, { error: upsertErr.message });
  }

  return json(200, { ok: true, user_id: userId, send_after: sendAfter.toISOString() });
});
