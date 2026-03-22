export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";

const KIND_DEFAULT = "avatar";

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") ?? KIND_DEFAULT).trim() || KIND_DEFAULT;

  try {
    const { data, error } = await supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    const rows = (data ?? []) as StudioGenerationRow[];
    const refundHints = await sweepStudioRefundHints(supabase, user.id, kind);
    const items = rows.map(studioGenerationRowToHistoryItem);

    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
