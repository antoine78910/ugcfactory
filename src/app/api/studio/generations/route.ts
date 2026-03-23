export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";

const KIND_DEFAULT = "avatar";

/** Kinds listed together on My Projects (studio library). */
const STUDIO_LIBRARY_KINDS = ["avatar", "studio_image", "studio_video", "studio_upscale", "motion_control"] as const;

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  const kind = (searchParams.get("kind") ?? KIND_DEFAULT).trim() || KIND_DEFAULT;

  try {
    let query = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (!all) {
      query = query.eq("kind", kind);
    } else {
      query = query.in("kind", [...STUDIO_LIBRARY_KINDS]);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = (data ?? []) as StudioGenerationRow[];
    let refundHints: { jobId: string; credits: number }[] = [];
    if (all) {
      for (const k of STUDIO_LIBRARY_KINDS) {
        refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
      }
    } else {
      refundHints = await sweepStudioRefundHints(supabase, user.id, kind);
    }
    const items = rows.map(studioGenerationRowToHistoryItem);

    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
