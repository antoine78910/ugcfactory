export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";

const MAX_PROJECT_BYTES = 1_800_000;

type Ctx = { params: Promise<{ spaceId: string }> };

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

function workflowInfraMissingResponse() {
  return NextResponse.json(
    {
      error:
        "Workflow sharing storage is not enabled yet on this database. Run the latest Supabase migration (workflow_spaces), then retry.",
    },
    { status: 503 },
  );
}

function isValidProject(p: unknown): p is WorkflowProjectStateV1 {
  if (!p || typeof p !== "object") return false;
  const o = p as { v?: unknown; pages?: unknown; activePageId?: unknown };
  return o.v === 1 && typeof o.activePageId === "string" && Array.isArray(o.pages);
}

/**
 * GET /api/workflow/spaces/[spaceId]
 * Returns the cloud-stored project state for a space the caller can access.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { spaceId: rawId } = await ctx.params;
  const spaceId = typeof rawId === "string" ? decodeURIComponent(rawId).trim() : "";
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId is required" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: collab } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!collab) {
    return NextResponse.json({ error: "You do not have access to this space" }, { status: 403 });
  }

  const { data: row, error } = await admin
    .from("workflow_spaces")
    .select("id, name, state, preview_data_url, published_community_template_id, updated_at, created_by")
    .eq("id", spaceId)
    .maybeSingle();

  if (error) {
    if (isMissingWorkflowSpacesInfra(error)) {
      return workflowInfraMissingResponse();
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  return NextResponse.json({
    space: {
      id: row.id,
      name: row.name,
      state: row.state,
      previewDataUrl: row.preview_data_url,
      publishedCommunityTemplateId: row.published_community_template_id,
      updatedAt: row.updated_at,
      ownerId: row.created_by,
      role: collab.role,
      isOwn: row.created_by === auth.user.id,
    },
  });
}

/**
 * PUT /api/workflow/spaces/[spaceId]
 * Upserts the project state for a space. The caller becomes owner if no
 * collaborator rows exist yet (first save), otherwise they must be owner or
 * editor.
 *
 * Body: { name?, state, previewDataUrl?, publishedCommunityTemplateId? }
 */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { spaceId: rawId } = await ctx.params;
  const spaceId = typeof rawId === "string" ? decodeURIComponent(rawId).trim() : "";
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId is required" }, { status: 400 });
  }

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
    state?: unknown;
    previewDataUrl?: unknown;
    publishedCommunityTemplateId?: unknown;
  };
  if (!isValidProject(b.state)) {
    return NextResponse.json({ error: "Invalid workflow state." }, { status: 400 });
  }
  const projectStr = JSON.stringify(b.state);
  if (projectStr.length > MAX_PROJECT_BYTES) {
    return NextResponse.json({ error: "Workflow project is too large to sync." }, { status: 413 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  // First, check if the caller has any access. If none exists for this space,
  // assume they are the original owner (this is the migration path: spaces
  // that lived only in localStorage for the editor become server-backed on
  // their first save).
  const { data: self } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  let role = self?.role ?? null;

  if (!role) {
    const { count, error: countErr } = await admin
      .from("workflow_space_collaborators")
      .select("*", { count: "exact", head: true })
      .eq("space_id", spaceId);

    if (countErr) {
      if (isMissingWorkflowSpacesInfra(countErr)) {
        return workflowInfraMissingResponse();
      }
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    if ((count ?? 0) === 0) {
      const { error: insertErr } = await admin.from("workflow_space_collaborators").insert({
        space_id: spaceId,
        user_id: auth.user.id,
        role: "owner",
      });
      if (insertErr) {
        if (isMissingWorkflowSpacesInfra(insertErr)) {
          return workflowInfraMissingResponse();
        }
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      role = "owner";
    } else {
      return NextResponse.json({ error: "You do not have access to this space" }, { status: 403 });
    }
  }

  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  }

  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 200) : "Untitled workflow";
  const previewDataUrl =
    typeof b.previewDataUrl === "string" && b.previewDataUrl.trim()
      ? b.previewDataUrl.trim()
      : null;
  const publishedCommunityTemplateId =
    typeof b.publishedCommunityTemplateId === "string" &&
    /^[0-9a-f-]{36}$/i.test(b.publishedCommunityTemplateId.trim())
      ? b.publishedCommunityTemplateId.trim()
      : null;

  const { data: existing } = await admin
    .from("workflow_spaces")
    .select("id, created_by")
    .eq("id", spaceId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (!existing) {
    const { error: insertErr } = await admin.from("workflow_spaces").insert({
      id: spaceId,
      name,
      state: b.state,
      preview_data_url: previewDataUrl,
      published_community_template_id: publishedCommunityTemplateId,
      created_by: auth.user.id,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insertErr) {
      if (isMissingWorkflowSpacesInfra(insertErr)) {
        return workflowInfraMissingResponse();
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  } else {
    const updatePayload: Record<string, unknown> = {
      name,
      state: b.state,
      preview_data_url: previewDataUrl,
      published_community_template_id: publishedCommunityTemplateId,
      updated_at: nowIso,
    };
    const { error: updateErr } = await admin
      .from("workflow_spaces")
      .update(updatePayload)
      .eq("id", spaceId);
    if (updateErr) {
      if (isMissingWorkflowSpacesInfra(updateErr)) {
        return workflowInfraMissingResponse();
      }
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, role });
}

/**
 * DELETE /api/workflow/spaces/[spaceId]
 * Removes the cloud-stored space and its sharing metadata. Only the owner can
 * call this; editors/viewers should leave via the collaborators endpoint.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { spaceId: rawId } = await ctx.params;
  const spaceId = typeof rawId === "string" ? decodeURIComponent(rawId).trim() : "";
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId is required" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: self } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!self || self.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete this space" }, { status: 403 });
  }

  await admin.from("workflow_invite_tokens").delete().eq("space_id", spaceId);
  await admin.from("workflow_space_collaborators").delete().eq("space_id", spaceId);
  await admin.from("workflow_spaces").delete().eq("id", spaceId);

  return NextResponse.json({ ok: true });
}
