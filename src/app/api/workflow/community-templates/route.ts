import { NextResponse } from "next/server";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";

const MAX_PROJECT_BYTES = 1_800_000;
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isValidProject(p: unknown): p is WorkflowProjectStateV1 {
  if (!p || typeof p !== "object") return false;
  const o = p as { v?: unknown; pages?: unknown; activePageId?: unknown };
  return o.v === 1 && typeof o.activePageId === "string" && Array.isArray(o.pages);
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
  // Backward compatibility for older rows missing `created_by`: fall back to display-name match.
  const ownerName = (row.created_by_name ?? "").trim().toLowerCase();
  if (!row.created_by && ownerName) {
    return ownerName === creatorDisplayNameFromAuthUser(user).trim().toLowerCase();
  }
  return false;
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("workflow_community_templates")
    .select("id, name, blurb, created_at, created_by_name, created_by")
    .order("created_at", { ascending: false })
    .limit(200);

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

  const templates = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    created_at: row.created_at,
    created_by_name: row.created_by_name,
    created_by_me: templateOwnedByUser(row, auth.user),
  }));
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const raw = await req.text();
  if (raw.length > MAX_PROJECT_BYTES + 50_000) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as {
    name?: unknown;
    blurb?: unknown;
    project?: unknown;
    templateId?: unknown;
  };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const blurb = typeof b.blurb === "string" ? b.blurb.trim() : "";
  const templateId = typeof b.templateId === "string" ? b.templateId.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!isValidProject(b.project)) {
    return NextResponse.json({ error: "Invalid workflow project." }, { status: 400 });
  }

  const projectStr = JSON.stringify(b.project);
  if (projectStr.length > MAX_PROJECT_BYTES) {
    return NextResponse.json({ error: "Workflow project is too large to publish." }, { status: 413 });
  }

  const isUpdate = /^[0-9a-f-]{36}$/i.test(templateId);
  const payload = {
    name: name.slice(0, 200),
    blurb: (blurb || "Shared workflow template.").slice(0, 500),
    project: b.project,
  };
  const q = auth.supabase.from("workflow_community_templates");
  const { data, error } = isUpdate
    ? await q
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", templateId)
        .eq("created_by", auth.user.id)
        .select("id, name, blurb, created_by_name")
        .maybeSingle()
    : await q
        .insert({
          created_by: auth.user.id,
          created_by_name: creatorDisplayNameFromAuthUser(auth.user),
          ...payload,
        })
        .select("id, name, blurb, created_by_name")
        .single();

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
  if (isUpdate && !data) {
    return NextResponse.json({ error: "Template not found or not owned by your account." }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}

export async function DELETE() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { error } = await auth.supabase
    .from("workflow_community_templates")
    .delete()
    .eq("created_by", auth.user.id);

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

  return NextResponse.json({ ok: true });
}
