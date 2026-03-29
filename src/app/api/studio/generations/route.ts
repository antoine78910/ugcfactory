export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";
import { markStaleInProgressStudioGenerationsFailedForUser } from "@/lib/studioGenerationsStale";
import { STUDIO_LIBRARY_KINDS } from "@/lib/studioGenerationKinds";

const KIND_DEFAULT = "avatar";

const ALLOWED_KINDS = new Set<string>(STUDIO_LIBRARY_KINDS);

function parseKindParam(kindParam: string): { mode: "all" } | { kinds: string[] } {
  const t = (kindParam || KIND_DEFAULT).trim() || KIND_DEFAULT;
  if (t === "all") return { mode: "all" };
  const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
  const kinds = parts.filter((k) => ALLOWED_KINDS.has(k));
  if (kinds.length === 0) return { kinds: [KIND_DEFAULT] };
  return { kinds };
}

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  const kindRaw = (searchParams.get("kind") ?? KIND_DEFAULT).trim() || KIND_DEFAULT;

  try {
    await markStaleInProgressStudioGenerationsFailedForUser(supabase, user.id);

    let query = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (all) {
      query = query.in("kind", [...STUDIO_LIBRARY_KINDS]);
    } else {
      const parsed = parseKindParam(kindRaw);
      if ("mode" in parsed) {
        query = query.in("kind", [...STUDIO_LIBRARY_KINDS]);
      } else if (parsed.kinds.length === 1) {
        query = query.eq("kind", parsed.kinds[0]!);
      } else {
        query = query.in("kind", parsed.kinds);
      }
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
      const parsed = parseKindParam(kindRaw);
      if ("mode" in parsed) {
        for (const k of STUDIO_LIBRARY_KINDS) {
          refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
        }
      } else {
        for (const k of parsed.kinds) {
          refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
        }
      }
    }
    const items = rows.map(studioGenerationRowToHistoryItem);

    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
