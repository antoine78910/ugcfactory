export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/**
 * GET /api/workflow/collaborators?spaceId=xxx
 * List all collaborators for a workspace. Caller must be a member.
 */
export async function GET(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const spaceId = url.searchParams.get("spaceId")?.trim() ?? "";

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

  if (!self) {
    return NextResponse.json({ error: "You are not a member of this space" }, { status: 403 });
  }

  const { data: collabs } = await admin
    .from("workflow_space_collaborators")
    .select("id, user_id, role, created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });

  if (!collabs) {
    return NextResponse.json({ collaborators: [] });
  }

  const userIds = collabs.map((c) => c.user_id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, email")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; first_name: string | null; email: string | null }) => [p.id, p]),
  );

  const result = collabs.map((c) => {
    const profile = profileMap.get(c.user_id);
    return {
      id: c.id,
      userId: c.user_id,
      role: c.role,
      email: profile?.email ?? null,
      name: profile?.first_name ?? null,
      isYou: c.user_id === auth.user.id,
    };
  });

  return NextResponse.json({ collaborators: result, yourRole: self.role });
}

/**
 * PATCH /api/workflow/collaborators
 * Update a collaborator's role or remove them.
 * Body: { spaceId, userId, action: "set-role" | "remove", role?: "editor" | "viewer" }
 * Only the owner can do this.
 */
export async function PATCH(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const body = (await req.json()) as {
    spaceId?: string;
    userId?: string;
    action?: string;
    role?: string;
  };
  const spaceId = typeof body.spaceId === "string" ? body.spaceId.trim() : "";
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const action = body.action;
  const role = body.role === "editor" ? "editor" : "viewer";

  if (!spaceId || !targetUserId || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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
    return NextResponse.json({ error: "Only the owner can manage collaborators" }, { status: 403 });
  }

  if (targetUserId === auth.user.id) {
    return NextResponse.json({ error: "Cannot modify your own access" }, { status: 400 });
  }

  if (action === "remove") {
    await admin
      .from("workflow_space_collaborators")
      .delete()
      .eq("space_id", spaceId)
      .eq("user_id", targetUserId);
    return NextResponse.json({ ok: true });
  }

  if (action === "set-role") {
    await admin
      .from("workflow_space_collaborators")
      .update({ role })
      .eq("space_id", spaceId)
      .eq("user_id", targetUserId);
    return NextResponse.json({ ok: true, role });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
