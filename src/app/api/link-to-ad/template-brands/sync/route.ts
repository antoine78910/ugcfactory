export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

type Body = {
  runId?: string;
  normalizedUrl?: string;
  storeUrl?: string;
  title?: string | null;
  thumbUrl?: string | null;
  remove?: boolean;
};

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
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
    const { error } = await admin.from("lta_template_brands").delete().eq("run_id", runId);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("relation") && msg.includes("does not exist")) {
        return NextResponse.json({ ok: true, persisted: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, persisted: true });
  }

  if (!normalizedUrl || !storeUrl) {
    return NextResponse.json({ error: "Missing normalizedUrl or storeUrl" }, { status: 400 });
  }

  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;
  const thumbUrl = typeof body?.thumbUrl === "string" && body.thumbUrl.trim() ? body.thumbUrl.trim() : null;

  const { error } = await admin.from("lta_template_brands").upsert(
    {
      run_id: runId,
      normalized_url: normalizedUrl,
      store_url: storeUrl,
      title,
      thumb_url: thumbUrl,
    },
    { onConflict: "run_id" },
  );

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
