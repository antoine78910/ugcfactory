export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { normalizeStoreUrl } from "@/lib/urlNormalize";

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("url") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const target = normalizeStoreUrl(raw);

  try {
    const { data: rows, error } = await supabase
      .from("ugc_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw error;

    const match =
      rows?.find((r) => {
        const su = typeof r.store_url === "string" ? r.store_url : "";
        return normalizeStoreUrl(su) === target;
      }) ?? null;

    return NextResponse.json({ data: match });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
