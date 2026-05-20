export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const ALLOWED_EVENTS = new Set([
  "careers_landing",
  "job_view",
  "application_tab_view",
  "application_started",
]);

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const visitorId = String((body as { visitorId?: unknown }).visitorId ?? "").trim();
  const eventType = String((body as { eventType?: unknown }).eventType ?? "").trim();
  const jobSlugRaw = (body as { jobSlug?: unknown }).jobSlug;
  const jobSlug =
    jobSlugRaw === undefined || jobSlugRaw === null
      ? null
      : String(jobSlugRaw).trim().slice(0, 120) || null;
  const meta = (body as { meta?: unknown }).meta;
  const metaObj =
    meta !== undefined && meta !== null && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};

  if (visitorId.length < 8 || visitorId.length > 80) {
    return NextResponse.json({ error: "Invalid visitor" }, { status: 400 });
  }

  if (!ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { error } = await admin.from("careers_funnel_events").insert({
    visitor_id: visitorId,
    event_type: eventType,
    job_slug: jobSlug,
    meta: metaObj,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
