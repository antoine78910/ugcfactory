export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";

function isValidProject(p: unknown): p is WorkflowProjectStateV1 {
  if (!p || typeof p !== "object") return false;
  const o = p as { v?: unknown; pages?: unknown; activePageId?: unknown };
  return o.v === 1 && typeof o.activePageId === "string" && Array.isArray(o.pages);
}

/**
 * GET /api/workflow/share-preview?token=…&spaceId=…
 * Public read-only snapshot for a workflow space when the caller holds a valid
 * invite token. Used by `/workflow/space/[id]?share=TOKEN` so guests can preview
 * without signing in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const spaceId = url.searchParams.get("spaceId")?.trim() ?? "";

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
  }
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId is required" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: invite, error: fetchErr } = await admin
    .from("workflow_invite_tokens")
    .select("id, space_id, permission, max_uses, used_count, expires_at, revoked")
    .eq("token", token)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.space_id !== spaceId) {
    return NextResponse.json({ error: "Invite does not match this workspace" }, { status: 403 });
  }

  if (invite.revoked) {
    return NextResponse.json({ error: "This invite link has been revoked" }, { status: 410 });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }
  if (invite.max_uses != null && invite.used_count >= invite.max_uses) {
    return NextResponse.json({ error: "This invite link has reached its limit" }, { status: 410 });
  }

  const { data: row, error: rowErr } = await admin
    .from("workflow_spaces")
    .select("id, name, state, preview_data_url, published_community_template_id, updated_at, created_by")
    .eq("id", spaceId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  if (!isValidProject(row.state)) {
    return NextResponse.json({ error: "Invalid workflow state" }, { status: 500 });
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
      /** Token permission; canvas is still read-only until the user joins as a collaborator. */
      linkPermission: invite.permission === "editor" ? "editor" : "viewer",
    },
  });
}
