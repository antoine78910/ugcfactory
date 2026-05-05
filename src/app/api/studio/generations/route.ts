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

const STUDIO_GENERATIONS_DEFAULT_PAGE_LIMIT = 60;
const STUDIO_GENERATIONS_MAX_PAGE_LIMIT = 200;

function parsePageLimit(raw: string | null): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return STUDIO_GENERATIONS_DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), STUDIO_GENERATIONS_MAX_PAGE_LIMIT);
}

function parseBeforeCursor(raw: string | null): string | undefined {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  const ms = Date.parse(t);
  return Number.isFinite(ms) && ms > 0 ? t : undefined;
}

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  const kindRaw = (searchParams.get("kind") ?? KIND_DEFAULT).trim() || KIND_DEFAULT;
  const limit = parsePageLimit(searchParams.get("limit"));
  const before = parseBeforeCursor(searchParams.get("before"));

  try {
    const fetchOptions: { mode: "all" } | { kinds: string[]; limit: number; before?: string } = (() => {
      if (all) return { mode: "all" } as const;
      const parsed = parseKindParam(kindRaw);
      if ("mode" in parsed) return { mode: "all" } as const;
      return { kinds: parsed.kinds, limit, ...(before ? { before } : {}) };
    })();

    const kindsToSweep: string[] =
      "mode" in fetchOptions ? [...STUDIO_LIBRARY_KINDS] : fetchOptions.kinds;

    const [, rowsRaw, refundHintsChunks] = await Promise.all([
      markStaleInProgressStudioGenerationsFailedForUser(supabase, user.id),
      fetchStudioGenerationRows(supabase, user.id, fetchOptions),
      Promise.all(
        kindsToSweep.map((k) => sweepStudioRefundHints(supabase, user.id, k)),
      ),
    ]);

    let rows = rowsRaw;
    if (!all) {
      const parsedForFilter = parseKindParam(kindRaw);
      if (!("mode" in parsedForFilter)) {
        rows = filterLegacyLinkToAdFromTabRows(rows, parsedForFilter.kinds);
      }
    }

    const refundHints = refundHintsChunks.flat();
    const items = rows.map(studioGenerationRowToHistoryItem);
    // hasMore is approximate: when DB returned exactly `limit` rows we cannot tell if more exist.
    // false negatives cause "Load more" to disappear a click early; false positives cause one empty fetch.
    const hasMore = !all && rowsRaw.length >= limit;

    return NextResponse.json({ data: items, refundHints, hasMore });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
