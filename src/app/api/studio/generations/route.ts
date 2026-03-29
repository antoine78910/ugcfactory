export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { fetchStudioGenerationRows } from "@/lib/studioGenerationsListQuery";
import { sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";
import { markStaleInProgressStudioGenerationsFailedForUser } from "@/lib/studioGenerationsStale";
import { STUDIO_LIBRARY_KINDS } from "@/lib/studioGenerationKinds";
import { filterLegacyLinkToAdFromTabRows } from "@/lib/studioGenerationsTabFilter";

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

    let rows: StudioGenerationRow[];
    if (all) {
      rows = await fetchStudioGenerationRows(supabase, user.id, { mode: "all" });
    } else {
      const parsed = parseKindParam(kindRaw);
      if ("mode" in parsed) {
        rows = await fetchStudioGenerationRows(supabase, user.id, { mode: "all" });
      } else {
        rows = await fetchStudioGenerationRows(supabase, user.id, { kinds: parsed.kinds });
      }
    }

    if (!all) {
      const parsedForFilter = parseKindParam(kindRaw);
      if (!("mode" in parsedForFilter)) {
        rows = filterLegacyLinkToAdFromTabRows(rows, parsedForFilter.kinds);
      }
    }
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
