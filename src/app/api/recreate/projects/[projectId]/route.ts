export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import type { RecreateProjectClientState, RecreateProjectRow } from "@/lib/recreateProjects";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  const { data, error } = await supabase
    .from("recreate_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(data as RecreateProjectRow);
}

type PatchBody = {
  title?: unknown;
  status?: unknown;
  clientState?: unknown;
  productImageUrl?: unknown;
  packagingImageUrl?: unknown;
  logoImageUrl?: unknown;
  analysis?: unknown;
  keyframesJson?: unknown;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 200);
  }
  if (body.status === "in_progress" || body.status === "archived") {
    patch.status = body.status;
  }
  if (body.clientState && typeof body.clientState === "object") {
    patch.client_state_json = body.clientState as RecreateProjectClientState;
  }
  if (body.productImageUrl === null) {
    patch.product_image_url = null;
  } else if (typeof body.productImageUrl === "string" && /^https?:\/\//i.test(body.productImageUrl.trim())) {
    patch.product_image_url = body.productImageUrl.trim();
  }
  if (body.packagingImageUrl === null) {
    patch.packaging_image_url = null;
  } else if (typeof body.packagingImageUrl === "string" && /^https?:\/\//i.test(body.packagingImageUrl.trim())) {
    patch.packaging_image_url = body.packagingImageUrl.trim();
  }
  if (body.logoImageUrl === null) {
    patch.logo_image_url = null;
  } else if (typeof body.logoImageUrl === "string" && /^https?:\/\//i.test(body.logoImageUrl.trim())) {
    patch.logo_image_url = body.logoImageUrl.trim();
  }

  if (body.analysis && typeof body.analysis === "object") {
    patch.analysis_json = body.analysis;
  }
  if (body.keyframesJson && typeof body.keyframesJson === "object") {
    patch.keyframes_json = body.keyframesJson;
  }

  const { data, error } = await supabase
    .from("recreate_projects")
    .update(patch)
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(data as RecreateProjectRow);
}
