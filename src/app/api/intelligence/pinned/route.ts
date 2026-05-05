export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type PinnedRow = {
  advertiser_id: string;
  name: string;
  logo: string | null;
  domain: string | null;
  created_at: string;
};

export async function GET() {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("intelligence_pinned")
    .select("advertiser_id, name, logo, domain, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []) as PinnedRow[]);
}

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    advertiser_id?: string;
    name?: string;
    logo?: string;
    domain?: string;
  };
  if (!body.advertiser_id || !body.name)
    return NextResponse.json({ error: "Missing advertiser_id or name" }, { status: 400 });

  const { error } = await supabase.from("intelligence_pinned").upsert({
    user_id: user.id,
    advertiser_id: body.advertiser_id,
    name: body.name,
    logo: body.logo ?? null,
    domain: body.domain ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("advertiser_id");
  if (!id) return NextResponse.json({ error: "Missing advertiser_id" }, { status: 400 });

  const { error } = await supabase
    .from("intelligence_pinned")
    .delete()
    .eq("user_id", user.id)
    .eq("advertiser_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
