export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await params;
  const rid = (id ?? "").trim();
  if (!rid) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("intelligence_recreations")
    .delete()
    .eq("user_id", user.id)
    .eq("id", rid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

