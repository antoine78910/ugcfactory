export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

function isMissingWorkflowSpacesInfra(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const mentionsWorkflowInfra =
    msg.includes("workflow_spaces") ||
    msg.includes("workflow_space_collaborators") ||
    msg.includes("workflow_invite_tokens");
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (mentionsWorkflowInfra && (msg.includes("schema cache") || msg.includes("does not exist")))
  );
}

/**
 * GET /api/workflow/spaces
 * Lists every workflow space the caller is a collaborator on (owner, editor,
 * or viewer). Returned for both the "my workflows" backup view and the
 * "shared" tab on the workflow landing page.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: collabRows, error: collabErr } = await admin
    .from("workflow_space_collaborators")
    .select("space_id, role, created_at")
    .eq("user_id", auth.user.id);

  if (collabErr) {
    if (isMissingWorkflowSpacesInfra(collabErr)) {
      return NextResponse.json(
        {
          error:
            "Workflow sharing storage is not enabled yet on this database. Run the latest Supabase migration (workflow_spaces), then retry.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: collabErr.message }, { status: 500 });
  }

  const spaceIds = Array.from(new Set((collabRows ?? []).map((r) => r.space_id)));
  if (spaceIds.length === 0) {
    return NextResponse.json({ spaces: [] });
  }

  const { data: spaceRows, error: spaceErr } = await admin
    .from("workflow_spaces")
    .select("id, name, preview_data_url, published_community_template_id, updated_at, created_by")
    .in("id", spaceIds);

  if (spaceErr) {
    if (isMissingWorkflowSpacesInfra(spaceErr)) {
      return NextResponse.json(
        {
          error:
            "Workflow sharing storage is not enabled yet on this database. Run the latest Supabase migration (workflow_spaces), then retry.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: spaceErr.message }, { status: 500 });
  }

  const ownerIds = Array.from(
    new Set((spaceRows ?? []).map((r) => r.created_by).filter((v): v is string => !!v)),
  );
  const ownerById = new Map<string, { name: string | null; email: string | null }>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, email")
      .in("id", ownerIds);
    for (const p of profiles ?? []) {
      ownerById.set(p.id as string, {
        name: (p.first_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      });
    }
  }

  const roleBySpaceId = new Map<string, { role: string; createdAt: string }>();
  for (const r of collabRows ?? []) {
    roleBySpaceId.set(r.space_id as string, {
      role: r.role as string,
      createdAt: r.created_at as string,
    });
  }

  const spaces = (spaceRows ?? []).map((row) => {
    const collab = roleBySpaceId.get(row.id as string);
    const owner = ownerById.get(row.created_by as string);
    return {
      id: row.id as string,
      name: (row.name as string) ?? "Untitled workflow",
      previewDataUrl: (row.preview_data_url as string | null) ?? null,
      publishedCommunityTemplateId:
        (row.published_community_template_id as string | null) ?? null,
      updatedAt: row.updated_at as string,
      role: collab?.role ?? "viewer",
      ownerId: (row.created_by as string) ?? null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      isOwn: row.created_by === auth.user.id,
    };
  });

  spaces.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return NextResponse.json({ spaces });
}
