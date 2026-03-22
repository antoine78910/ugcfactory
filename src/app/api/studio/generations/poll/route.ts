export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { pollStudioGenerationRow, sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";

type Body = {
  kind?: string;
  personalApiKey?: string;
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body = {};
  try {
    body = (await req.json().catch(() => ({}))) as Body;
  } catch {
    body = {};
  }

  const kind = (body.kind ?? "avatar").trim() || "avatar";
  const personalApiKey = (body.personalApiKey ?? "").trim() || undefined;

  try {
    const { data: processing, error: procErr } = await supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", kind)
      .eq("status", "processing");

    if (procErr) throw procErr;

    for (const row of (processing ?? []) as StudioGenerationRow[]) {
      try {
        await pollStudioGenerationRow(row, personalApiKey, supabase);
      } catch {
        /* one bad poll should not block others */
      }
    }

    const refundHints = await sweepStudioRefundHints(supabase, user.id, kind);

    const { data: all, error: listErr } = await supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(80);

    if (listErr) throw listErr;

    const items = ((all ?? []) as StudioGenerationRow[]).map(studioGenerationRowToHistoryItem);
    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
