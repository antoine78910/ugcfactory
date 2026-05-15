export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type CreateBody = {
  title?: unknown;
  site_url?: unknown;
  site_name?: unknown;
  site_pages?: unknown;
  site_analysis?: unknown;
  marketing_angles?: unknown;
  competitors?: unknown;
};

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("brand_projects")
    .select("id,title,site_url,site_name,updated_at,created_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const site_url = typeof body.site_url === "string" ? body.site_url.trim() : "";
  if (!title || !site_url) {
    return NextResponse.json({ error: "Missing title or site_url" }, { status: 400 });
  }

  const site_name = typeof body.site_name === "string" ? body.site_name.trim() : null;
  const site_pages = Array.isArray(body.site_pages) ? body.site_pages : [];
  const site_analysis =
    body.site_analysis && typeof body.site_analysis === "object" ? body.site_analysis : {};
  const marketing_angles = Array.isArray(body.marketing_angles) ? body.marketing_angles : [];
  const competitors = Array.isArray(body.competitors) ? body.competitors : [];

  const { data, error } = await auth.supabase
    .from("brand_projects")
    .insert({
      user_id: auth.user.id,
      title,
      site_url,
      site_name: site_name || null,
      site_pages,
      site_analysis,
      marketing_angles,
      competitors,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}
