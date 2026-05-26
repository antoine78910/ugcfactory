export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

type Body = {
  runId?: string;
  normalizedUrl?: string;
  storeUrl?: string;
  title?: string | null;
  thumbUrl?: string | null;
  remove?: boolean;
};

function isTableMissingError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("relation") && m.includes("does not exist");
}

export async function POST(req: Request) {
  const auth = await requireLtaTemplateRecordingUser();
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const normalizedUrl = typeof body?.normalizedUrl === "string" ? body.normalizedUrl.trim().toLowerCase() : "";
  const storeUrl = typeof body?.storeUrl === "string" ? body.storeUrl.trim() : "";

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  if (body?.remove) {
    // Delete all entries for this brand.  Prefer normalizedUrl (clears every stale
    // run_id entry for the same brand); fall back to run_id if URL is absent.
    let deleteError: { message: string } | null = null;
    if (normalizedUrl) {
      const { error } = await admin
        .from("lta_template_brands")
        .delete()
        .eq("normalized_url", normalizedUrl);
      deleteError = error;
    } else if (runId) {
      const { error } = await admin
        .from("lta_template_brands")
        .delete()
        .eq("run_id", runId);
      deleteError = error;
    }
    if (deleteError) {
      if (isTableMissingError(deleteError.message)) {
        return NextResponse.json({ ok: true, persisted: false });
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, persisted: true });
  }

  if (!normalizedUrl || !storeUrl) {
    return NextResponse.json({ error: "Missing normalizedUrl or storeUrl" }, { status: 400 });
  }

  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;
  const thumbUrl = typeof body?.thumbUrl === "string" && body.thumbUrl.trim() ? body.thumbUrl.trim() : null;

  // Delete any existing entries for this normalizedUrl first (handles stale run_id entries).
  // Ignore errors (e.g. row not found is fine).
  await admin.from("lta_template_brands").delete().eq("normalized_url", normalizedUrl);

  const { error } = await admin.from("lta_template_brands").insert({
    run_id: runId,
    normalized_url: normalizedUrl,
    store_url: storeUrl,
    title,
    thumb_url: thumbUrl,
  });

  if (error) {
    if (isTableMissingError(error.message)) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
