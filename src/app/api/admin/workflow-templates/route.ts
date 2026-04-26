export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

type Row = {
  id: string;
  created_by: string | null;
  created_by_name: string | null;
  name: string;
  blurb: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(10, Number(url.searchParams.get("per_page")) || 50));
  const search = url.searchParams.get("q")?.trim() || null;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("workflow_community_templates")
    .select("id, created_by, created_by_name, name, blurb, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`name.ilike.%${search}%,blurb.ilike.%${search}%,created_by_name.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x)))];
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users?.users) {
      for (const u of users.users) {
        if (userIds.includes(u.id)) emailMap[u.id] = u.email ?? u.id;
      }
    }
  }

  return NextResponse.json({
    rows,
    emailMap,
    total: count ?? 0,
    page,
    perPage,
  });
}

export async function DELETE(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  const { error } = await admin.from("workflow_community_templates").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

