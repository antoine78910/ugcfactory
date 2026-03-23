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

const LIBRARY_KINDS = ["avatar", "studio_image"] as const;

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
    let procQuery = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "processing");

    if (kind === "all") {
      procQuery = procQuery.in("kind", [...LIBRARY_KINDS]);
    } else {
      procQuery = procQuery.eq("kind", kind);
    }

    const { data: processing, error: procErr } = await procQuery;

    if (procErr) throw procErr;

    for (const row of (processing ?? []) as StudioGenerationRow[]) {
      try {
        await pollStudioGenerationRow(row, personalApiKey, supabase);
      } catch {
        /* one bad poll should not block others */
      }
    }

    let refundHints: { jobId: string; credits: number }[] = [];
    if (kind === "all") {
      for (const k of LIBRARY_KINDS) {
        refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
      }
    } else {
      refundHints = await sweepStudioRefundHints(supabase, user.id, kind);
    }

    let listQuery = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (kind === "all") {
      listQuery = listQuery.in("kind", [...LIBRARY_KINDS]);
    } else {
      listQuery = listQuery.eq("kind", kind);
    }

    const { data: all, error: listErr } = await listQuery;

    if (listErr) throw listErr;

    const items = ((all ?? []) as StudioGenerationRow[]).map(studioGenerationRowToHistoryItem);
    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
