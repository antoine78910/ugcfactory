export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

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
  const category = url.searchParams.get("category")?.trim() || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("feedback_submissions")
    .select("id,user_id,email,category,message,page_path,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) query = query.eq("category", category);
  if (q) query = query.or(`email.ilike.%${q}%,message.ilike.%${q}%,page_path.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}

