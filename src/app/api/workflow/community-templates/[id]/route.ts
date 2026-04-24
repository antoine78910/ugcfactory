import { NextResponse } from "next/server";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const uuid = typeof id === "string" ? id.trim() : "";
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("workflow_community_templates")
    .select("id, name, blurb, project, created_at")
    .eq("id", uuid)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}
