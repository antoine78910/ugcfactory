export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ spaceId: string }> };

/**
 * GET /api/workflow/spaces/[spaceId]/versions
 * Lists server-side snapshots (newest first) for a space the caller can access.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { spaceId: rawId } = await ctx.params;
  const spaceId = typeof rawId === "string" ? decodeURIComponent(rawId).trim() : "";
  if (!spaceId) return NextResponse.json({ error: "spaceId is required" }, { status: 400 });

  const admin = createSupabaseServiceClient();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: collab } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!collab) return NextResponse.json({ error: "You do not have access to this space" }, { status: 403 });

  const { data, error } = await admin
    .from("workflow_space_versions")
    .select("id, node_count, reason, created_at, source_updated_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    versions: (data ?? []).map((v) => ({
      id: String(v.id),
      nodeCount: v.node_count,
      reason: v.reason,
      createdAt: v.created_at,
      savedAt: v.source_updated_at,
    })),
  });
}
