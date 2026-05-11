export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { studioGenerationRowToHistoryItem } from "@/lib/studioGenerationsMap";
import { fetchStudioGenerationRows } from "@/lib/studioGenerationsListQuery";
import { sweepStudioRefundHints } from "@/lib/studioGenerationsPoll";
import { markStaleInProgressStudioGenerationsFailedForUser } from "@/lib/studioGenerationsStale";
import { STUDIO_LIBRARY_KINDS } from "@/lib/studioGenerationKinds";
import { filterLegacyLinkToAdFromTabRows } from "@/lib/studioGenerationsTabFilter";
import { shouldRunThrottled } from "@/lib/perUserThrottle";

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

/** Stale-marker is a no-op for 99% of users; throttle to once per 10 min per user. */
const STALE_MARKER_TTL_MS = 10 * 60 * 1000;
/**
 * Refund-hint sweep also runs from the background poll loop (every 4.5s) — running it
 * from each GET is redundant. Throttle to once per 30s per (user, kind).
 */
const REFUND_SWEEP_TTL_MS = 30 * 1000;

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

/**
 * Pure-read history endpoint.
 *
 * Previous versions also (a) marked stale rows failed, (b) swept refund hints for every
 * library kind, (c) synchronously polled up to 12 in-flight rows against KIE/PiAPI/WaveSpeed,
 * and (d) re-fetched the list afterwards — multiplying the GET latency by 3-5 s when any
 * job was in flight. Polling now lives exclusively in POST /api/studio/generations/poll
 * (called every 4.5 s by the background loop). Stale + sweep are throttled in-process so
 * they still run, but at most once per 10 min and 30 s respectively per user / kind.
 */
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

    // Stale marker: throttled — most calls become a no-op.
    const staleP = shouldRunThrottled("stale_marker", user.id, STALE_MARKER_TTL_MS)
      ? markStaleInProgressStudioGenerationsFailedForUser(supabase, user.id).catch(() => undefined)
      : Promise.resolve(undefined);

    // Refund-hint sweep: throttled per (user, kind). The background poll route (POST
    // /api/studio/generations/poll) also sweeps after each KIE poll, so within 4.5 s
    // a freshly-failed job will still surface a refund toast even when this throttles.
    const sweepP = Promise.all(
      kindsToSweep.map((k) => {
        if (!shouldRunThrottled("refund_sweep", `${user.id}:${k}`, REFUND_SWEEP_TTL_MS)) {
          return Promise.resolve([] as { jobId: string; credits: number }[]);
        }
        return sweepStudioRefundHints(supabase, user.id, k).catch(() => [] as { jobId: string; credits: number }[]);
      }),
    );

    const [, rowsRaw, refundHintsChunks] = await Promise.all([
      staleP,
      fetchStudioGenerationRows(supabase, user.id, fetchOptions),
      sweepP,
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
