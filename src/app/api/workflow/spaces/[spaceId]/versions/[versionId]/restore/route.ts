export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ spaceId: string; versionId: string }> };

/**
 * POST /api/workflow/spaces/[spaceId]/versions/[versionId]/restore
 * Replaces the space state with a stored snapshot. The DB trigger snapshots the
 * current state first, so a restore can itself be undone.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { spaceId: rawSpace, versionId: rawVersion } = await ctx.params;
  const spaceId = typeof rawSpace === "string" ? decodeURIComponent(rawSpace).trim() : "";
  const versionId = typeof rawVersion === "string" ? decodeURIComponent(rawVersion).trim() : "";
  if (!spaceId || !/^\d+$/.test(versionId)) {
    return NextResponse.json({ error: "Invalid space or version id" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: collab } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!collab || (collab.role !== "owner" && collab.role !== "editor")) {
    return NextResponse.json({ error: "Only owners and editors can restore versions" }, { status: 403 });
  }

  const { data: version, error: vErr } = await admin
    .from("workflow_space_versions")
    .select("state")
    .eq("id", versionId)
    .eq("space_id", spaceId)
    .maybeSingle();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { error: uErr } = await admin
    .from("workflow_spaces")
    .update({ state: version.state, updated_at: nowIso })
    .eq("id", spaceId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, state: version.state, updatedAt: nowIso });
}
