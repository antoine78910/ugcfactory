import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import { fetchStudioGenerationRows } from "@/lib/studioGenerationsListQuery";
import {
  pollStudioGenerationRow,
  STUDIO_GENERATION_IN_PROGRESS_STATUSES,
  sweepStudioRefundHints,
} from "@/lib/studioGenerationsPoll";
import { serverLog } from "@/lib/serverLog";
import { markStaleInProgressStudioGenerationsFailedForUser } from "@/lib/studioGenerationsStale";
import {
  STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
  STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO,
  STUDIO_IMAGE_TAB_KINDS,
  STUDIO_LIBRARY_KINDS,
  STUDIO_VIDEO_TAB_KINDS,
} from "@/lib/studioGenerationKinds";
import {
  filterLegacyLinkToAdFromTabRows,
  isStudioImageTabKindQuery,
  isStudioVideoTabKindQuery,
} from "@/lib/studioGenerationsTabFilter";

export const runtime = "nodejs";

/**
 * Vercel serverless: Hobby ~10s max unless project uses Pro Fluid Compute with a higher limit.
 * Poll touches DB + KIE/PiAPI + optional download/re-upload of media per row, keep row cap below.
 */
export const maxDuration = 60;

type Body = {
  kind?: string;
  personalApiKey?: string;
  piapiApiKey?: string;
};

const LIBRARY_KINDS = STUDIO_LIBRARY_KINDS;

/**
 * Cap per request to stay under serverless limits. Too low starves newer jobs when many rows are
 * in-flight (always ordering by oldest `created_at` first).
 */
const MAX_ROWS_TO_POLL_PER_REQUEST = 28;

const ALLOWED_POLL_KINDS = new Set<string>(LIBRARY_KINDS);
const POLL_KIND_DEFAULT = "avatar";

function resolvePollKinds(kind: string): string[] | "all" {
  const t = kind.trim();
  if (t === "all") return "all";
  const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
  const kinds = parts.filter((k) => ALLOWED_POLL_KINDS.has(k));
  if (kinds.length === 0) {
    return ALLOWED_POLL_KINDS.has(t) ? [t] : [POLL_KIND_DEFAULT];
  }
  return kinds;
}

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
  const piapiApiKey = (body.piapiApiKey ?? "").trim() || undefined;

  try {
    await markStaleInProgressStudioGenerationsFailedForUser(supabase, user.id);

    const resolvedKinds = resolvePollKinds(kind);

    let procQuery = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]);

    if (resolvedKinds === "all") {
      procQuery = procQuery.in("kind", [...LIBRARY_KINDS]);
    } else if (isStudioVideoTabKindQuery(resolvedKinds)) {
      const processingKinds = [
        ...new Set([...STUDIO_VIDEO_TAB_KINDS, STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO]),
      ];
      procQuery = procQuery.in("kind", processingKinds);
    } else if (isStudioImageTabKindQuery(resolvedKinds)) {
      const processingKinds = [
        ...new Set([...STUDIO_IMAGE_TAB_KINDS, STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE]),
      ];
      procQuery = procQuery.in("kind", processingKinds);
    } else if (resolvedKinds.length === 1) {
      procQuery = procQuery.eq("kind", resolvedKinds[0]!);
    } else {
      procQuery = procQuery.in("kind", resolvedKinds);
    }

    procQuery = procQuery.order("created_at", { ascending: true }).limit(MAX_ROWS_TO_POLL_PER_REQUEST);

    const { data: processing, error: procErr } = await procQuery;

    if (procErr) throw procErr;

    const processingRows = (processing ?? []) as StudioGenerationRow[];
    const admin = createSupabaseServiceClient();
    const pollDbClient = admin ?? supabase;
    for (const row of processingRows) {
      try {
        await pollStudioGenerationRow(row, personalApiKey, piapiApiKey, pollDbClient);
      } catch {
        /* one bad poll should not block others */
      }
    }
    const kindsToSweep =
      resolvedKinds === "all" ? [...LIBRARY_KINDS] : resolvedKinds;
    const sweepChunks = await Promise.all(
      kindsToSweep.map(async (k) => {
        try {
          return await sweepStudioRefundHints(supabase, user.id, k);
        } catch (e) {
          console.error("[studio/generations/poll] sweepStudioRefundHints", k, e);
          return [] as { jobId: string; credits: number }[];
        }
      }),
    );
    const refundHints = sweepChunks.flat();

    if (refundHints.length > 0) {
      serverLog("studio_generations_refund_hints", { count: refundHints.length, kind });
    }

    let listRows: StudioGenerationRow[];
    if (resolvedKinds === "all") {
      listRows = await fetchStudioGenerationRows(supabase, user.id, { mode: "all" });
    } else if (resolvedKinds.length === 1) {
      listRows = await fetchStudioGenerationRows(supabase, user.id, { kinds: [resolvedKinds[0]!] });
    } else {
      listRows = await fetchStudioGenerationRows(supabase, user.id, { kinds: resolvedKinds });
    }
    if (resolvedKinds !== "all") {
      listRows = filterLegacyLinkToAdFromTabRows(listRows, resolvedKinds);
    }
    const items = listRows.map(studioGenerationRowToHistoryItem);
    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" &&
            err !== null &&
            "message" in err &&
            typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : String(err ?? "Unknown error.");
    serverLog("studio_generations_poll_error", { message: message.slice(0, 240) });
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
