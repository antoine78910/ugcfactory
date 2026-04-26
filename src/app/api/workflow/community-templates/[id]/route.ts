import { NextResponse } from "next/server";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Ctx = { params: Promise<{ id: string }> };

function isMissingCommunityTemplatesTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (msg.includes("workflow_community_templates") && msg.includes("schema cache")) ||
    (msg.includes("workflow_community_templates") && msg.includes("does not exist"))
  );
}

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
    .select("id, name, blurb, project, created_at, created_by_name")
    .eq("id", uuid)
    .maybeSingle();

  if (error) {
    if (isMissingCommunityTemplatesTable(error)) {
      return NextResponse.json(
        {
          error:
            "Community templates are not enabled yet on this database. Run the latest Supabase migration, then retry.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}
