export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS } from "@/lib/ltaTemplateRecording";
import { isMissingLtaTemplateTableError } from "@/lib/ltaTemplateRecordingDb";

export type LtaTemplateRecordingUserRow = {
  email: string;
  created_at: string;
  builtin: boolean;
};

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({
      rows: [...LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS].map((email) => ({
        email,
        created_at: "",
        builtin: true,
      })),
      warning: "Service role not configured",
    });
  }

  const { data, error } = await admin
    .from("lta_template_recording_users")
    .select("email, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingLtaTemplateTableError(error.message)) {
      return NextResponse.json({
        rows: [...LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS].map((email) => ({
          email,
          created_at: "",
          builtin: true,
        })),
        warning: "Run migration 20260523120000_lta_template_recording.sql on your Supabase project.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fromDb = (data ?? []).map((r) => ({
    email: String(r.email ?? "").toLowerCase(),
    created_at: String(r.created_at ?? ""),
    builtin: LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS.has(String(r.email ?? "").toLowerCase()),
  }));

  const seen = new Set(fromDb.map((r) => r.email));
  for (const email of LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS) {
    if (!seen.has(email)) {
      fromDb.unshift({ email, created_at: "", builtin: true });
    }
  }

  return NextResponse.json({ rows: fromDb });
}

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

  const { error } = await admin.from("lta_template_recording_users").upsert({ email }, { onConflict: "email" });
  if (error) {
    if (isMissingLtaTemplateTableError(error.message)) {
      return NextResponse.json(
        { error: "Template recording tables are missing. Run the Supabase migration first." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json({ error: "Missing email query param" }, { status: 400 });
  }

  if (LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS.has(email)) {
    return NextResponse.json({ error: "Cannot remove built-in default account" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const { error } = await admin.from("lta_template_recording_users").delete().eq("email", email);
  if (error) {
    if (isMissingLtaTemplateTableError(error.message)) {
      return NextResponse.json(
        { error: "Template recording tables are missing. Run the Supabase migration first." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
