export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export type ClippingTemplateSignupRow = {
  visitor_id: string;
  user_id: string | null;
  email: string | null;
  first_clicked_at: string;
  signed_up_at: string | null;
  template_access_granted_at: string | null;
  /** True when email is on lta_template_recording_users allowlist. */
  template_access_enabled: boolean;
};

function isMissingClippingSignupTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("clipping_template_signups") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ rows: [], warning: "Service role not configured" });
  }

  const { data, error } = await admin
    .from("clipping_template_signups")
    .select("visitor_id, user_id, email, first_clicked_at, signed_up_at, template_access_granted_at")
    .order("signed_up_at", { ascending: false, nullsFirst: false })
    .order("first_clicked_at", { ascending: false });

  if (error) {
    if (isMissingClippingSignupTableError(error.message)) {
      return NextResponse.json({
        rows: [],
        warning: "Run migration 20260527140000_clipping_template_signups.sql on your Supabase project.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emails = (data ?? [])
    .map((r) => String(r.email ?? "").trim().toLowerCase())
    .filter(Boolean);
  const allowlisted = new Set<string>();
  if (emails.length > 0) {
    const { data: allowRows } = await admin
      .from("lta_template_recording_users")
      .select("email")
      .in("email", emails);
    for (const row of allowRows ?? []) {
      const e = String(row.email ?? "").trim().toLowerCase();
      if (e) allowlisted.add(e);
    }
  }

  const rows: ClippingTemplateSignupRow[] = (data ?? []).map((r) => {
    const email = r.email ? String(r.email).trim().toLowerCase() : null;
    return {
      visitor_id: String(r.visitor_id ?? ""),
      user_id: r.user_id ? String(r.user_id) : null,
      email,
      first_clicked_at: String(r.first_clicked_at ?? ""),
      signed_up_at: r.signed_up_at ? String(r.signed_up_at) : null,
      template_access_granted_at: r.template_access_granted_at
        ? String(r.template_access_granted_at)
        : null,
      template_access_enabled: email ? allowlisted.has(email) : false,
    };
  });

  return NextResponse.json({ rows });
}

/** Grant Link to Ad template-recording toggle for a clipping signup email. */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const now = new Date().toISOString();

  const { error: allowErr } = await admin
    .from("lta_template_recording_users")
    .upsert({ email }, { onConflict: "email" });
  if (allowErr) {
    return NextResponse.json({ error: allowErr.message }, { status: 500 });
  }

  const { error: markErr } = await admin
    .from("clipping_template_signups")
    .update({ template_access_granted_at: now })
    .eq("email", email);
  if (markErr && !isMissingClippingSignupTableError(markErr.message)) {
    return NextResponse.json({ error: markErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
