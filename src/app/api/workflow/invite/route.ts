export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/**
 * POST /api/workflow/invite
 * Accept an invite token. Adds the caller as a collaborator.
 * Body: { token: string }
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const body = (await req.json()) as { token?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: invite, error: fetchErr } = await admin
    .from("workflow_invite_tokens")
    .select("id, space_id, permission, max_uses, used_count, expires_at, revoked, created_by")
    .eq("token", token)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
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

  const { data: existing } = await admin
    .from("workflow_space_collaborators")
    .select("id, role")
    .eq("space_id", invite.space_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      spaceId: invite.space_id,
      role: existing.role,
      alreadyMember: true,
    });
  }

  const role = invite.permission === "editor" ? "editor" : "viewer";

  const { error: insertErr } = await admin
    .from("workflow_space_collaborators")
    .insert({
      space_id: invite.space_id,
      user_id: auth.user.id,
      role,
    });

  if (insertErr) {
    return NextResponse.json({ error: "Failed to join space" }, { status: 500 });
  }

  await admin
    .from("workflow_invite_tokens")
    .update({ used_count: invite.used_count + 1 })
    .eq("id", invite.id);

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("first_name, email")
    .eq("id", invite.created_by)
    .maybeSingle();

  const ownerEmail = ownerProfile?.email ?? null;
  const ownerName = ownerProfile?.first_name ?? null;

  return NextResponse.json({
    spaceId: invite.space_id,
    role,
    alreadyMember: false,
    invitedBy: ownerName || ownerEmail || "a collaborator",
  });
}

/**
 * GET /api/workflow/invite?token=xxx
 * Peek at an invite without accepting (used by the invite page to show info).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";

  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: invite, error: fetchErr } = await admin
    .from("workflow_invite_tokens")
    .select("space_id, permission, expires_at, revoked, created_by")
    .eq("token", token)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.revoked) {
    return NextResponse.json({ error: "This invite link has been revoked" }, { status: 410 });
  }

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("first_name, email")
    .eq("id", invite.created_by)
    .maybeSingle();

  return NextResponse.json({
    spaceId: invite.space_id,
    permission: invite.permission,
    invitedBy: ownerProfile?.first_name || ownerProfile?.email || "Someone",
    expired: invite.expires_at ? new Date(invite.expires_at) < new Date() : false,
  });
}
