export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/**
 * POST /api/workflow/share
 * Generate (or refresh) an invite link for a workflow space.
 * Body: { spaceId: string, permission: "viewer" | "editor" }
 *
 * Only the space owner can generate invite links.
 * Also ensures the caller is registered as owner if no collaborator rows exist yet.
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const body = (await req.json()) as { spaceId?: string; permission?: string };
  const spaceId = typeof body.spaceId === "string" ? body.spaceId.trim() : "";
  const permission = body.permission === "editor" ? "editor" : "viewer";

  if (!spaceId) {
    return NextResponse.json({ error: "spaceId is required" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: existing } = await admin
    .from("workflow_space_collaborators")
    .select("id, role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!existing) {
    const { data: anyCollab } = await admin
      .from("workflow_space_collaborators")
      .select("id")
      .eq("space_id", spaceId)
      .limit(1)
      .maybeSingle();

    if (anyCollab) {
      return NextResponse.json({ error: "You are not the owner of this space" }, { status: 403 });
    }

    await admin.from("workflow_space_collaborators").insert({
      space_id: spaceId,
      user_id: auth.user.id,
      role: "owner",
    });
  } else if (existing.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can generate invite links" }, { status: 403 });
  }

  const { data: activeToken } = await admin
    .from("workflow_invite_tokens")
    .select("id, token, permission, created_at")
    .eq("space_id", spaceId)
    .eq("permission", permission)
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeToken) {
    return NextResponse.json({
      token: activeToken.token,
      permission,
      inviteUrl: buildInviteUrl(req, activeToken.token),
    });
  }

  const { data: newToken, error: insertErr } = await admin
    .from("workflow_invite_tokens")
    .insert({
      space_id: spaceId,
      created_by: auth.user.id,
      permission,
    })
    .select("token")
    .single();

  if (insertErr || !newToken) {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  return NextResponse.json({
    token: newToken.token,
    permission,
    inviteUrl: buildInviteUrl(req, newToken.token),
  });
}

function buildInviteUrl(req: Request, token: string): string {
  const url = new URL(req.url);
  return `${url.origin}/workflow/invite/${token}`;
}

/**
 * DELETE /api/workflow/share
 * Revoke all active invite tokens for a specific permission level on a space.
 * Body: { spaceId: string, permission: "viewer" | "editor" }
 */
export async function DELETE(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const body = (await req.json()) as { spaceId?: string; permission?: string };
  const spaceId = typeof body.spaceId === "string" ? body.spaceId.trim() : "";
  const permission = body.permission === "editor" ? "editor" : "viewer";

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

  if (!collab || collab.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can revoke links" }, { status: 403 });
  }

  await admin
    .from("workflow_invite_tokens")
    .update({ revoked: true })
    .eq("space_id", spaceId)
    .eq("permission", permission)
    .eq("revoked", false);

  return NextResponse.json({ ok: true });
}
