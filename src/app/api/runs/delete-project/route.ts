export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { normalizeStoreUrl } from "@/lib/urlNormalize";

type Body = { storeUrl?: string };

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const raw = (body?.storeUrl ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Missing `storeUrl`." }, { status: 400 });

  const target = normalizeStoreUrl(raw);

  try {
    const { data: rows, error: listErr } = await supabase
      .from("ugc_runs")
      .select("id, store_url")
      .eq("user_id", user.id)
      .limit(200);
    if (listErr) throw listErr;

    const ids =
      rows
        ?.filter((r) => typeof r.store_url === "string" && normalizeStoreUrl(r.store_url) === target)
        .map((r) => r.id) ?? [];

    if (ids.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const { error: delErr } = await supabase.from("ugc_runs").delete().in("id", ids).eq("user_id", user.id);
    if (delErr) throw delErr;

    return NextResponse.json({ deleted: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
