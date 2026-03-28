export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { isStudioGenerationRowId } from "@/lib/studioGenerationRowId";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { id: raw } = await ctx.params;
  const id = String(raw ?? "").trim();
  if (!id || !isStudioGenerationRowId(id)) {
    return NextResponse.json({ error: "Invalid generation id." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("studio_generations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (!data?.length) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
