import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingHidePromptsColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42703" || msg.includes("hide_prompts_for_guests");
}

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

function creatorDisplayNameFromAuthUser(user: { email?: string | null; user_metadata?: unknown }): string {
  const md = (user.user_metadata ?? {}) as { first_name?: unknown; name?: unknown };
  const firstName = typeof md.first_name === "string" ? md.first_name.trim() : "";
  if (firstName) return firstName.slice(0, 80);
  const fullName = typeof md.name === "string" ? md.name.trim() : "";
  if (fullName) return fullName.slice(0, 80);
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (email.includes("@")) return email.split("@")[0].slice(0, 80);
  return "User";
}

function templateOwnedByUser(
  row: { created_by?: string | null; created_by_name?: string | null },
  user: { id: string; email?: string | null; user_metadata?: unknown },
): boolean {
  if (row.created_by && row.created_by === user.id) return true;
  if (!row.created_by) {
    return (row.created_by_name ?? "").trim().toLowerCase() === creatorDisplayNameFromAuthUser(user).toLowerCase();
  }
  return false;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  const admin = createSupabaseServiceClient();
  // Public read: anonymous users (e.g. /clipping/public) can load template bodies via service role.
  const client = auth.response ? admin : auth.supabase;
  if (!client) {
    return NextResponse.json({ error: "Templates unavailable." }, { status: 503 });
  }

  const { id } = await ctx.params;
  const uuid = typeof id === "string" ? id.trim() : "";
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  let { data, error } = await client
    .from("workflow_community_templates")
    .select("id, name, blurb, project, created_at, created_by_name, hide_prompts_for_guests")
    .eq("id", uuid)
    .maybeSingle();

  if (error && isMissingHidePromptsColumn(error)) {
    const fallback = await client
      .from("workflow_community_templates")
      .select("id, name, blurb, project, created_at, created_by_name")
      .eq("id", uuid)
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, hide_prompts_for_guests: true } : null;
    error = fallback.error;
  }

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

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const uuid = typeof id === "string" ? id.trim() : "";
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  const { data: row, error: rowErr } = await auth.supabase
    .from("workflow_community_templates")
    .select("id, created_by, created_by_name")
    .eq("id", uuid)
    .maybeSingle();

  if (rowErr) {
    if (isMissingCommunityTemplatesTable(rowErr)) {
      return NextResponse.json(
        {
          error:
            "Community templates are not enabled yet on this database. Run the latest Supabase migration, then retry.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (!templateOwnedByUser(row, auth.user)) {
    return NextResponse.json({ error: "You can only delete templates from your own account." }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("workflow_community_templates")
    .delete()
    .eq("id", uuid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
