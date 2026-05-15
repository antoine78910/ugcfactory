export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type PatchBody = {
  title?: unknown;
  marketing_angles?: unknown;
  competitors?: unknown;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await auth.supabase.from("brand_projects").select("*").eq("id", id).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim();
  }
  if (Array.isArray(body.marketing_angles)) {
    patch.marketing_angles = body.marketing_angles;
  }
  if (Array.isArray(body.competitors)) {
    patch.competitors = body.competitors;
  }

  const { data, error } = await auth.supabase.from("brand_projects").update(patch).eq("id", id).select("*").maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await auth.supabase.from("brand_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
