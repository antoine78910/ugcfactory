import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  studioGenerationRowToHistoryItem,
  type StudioGenerationRow,
} from "@/lib/studioGenerationsMap";
import {
  pollStudioGenerationRow,
  STUDIO_GENERATION_IN_PROGRESS_STATUSES,
  sweepStudioRefundHints,
} from "@/lib/studioGenerationsPoll";
import { serverLog } from "@/lib/serverLog";
import { markStaleInProgressStudioGenerationsFailedForUser } from "@/lib/studioGenerationsStale";

export const runtime = "nodejs";

/**
 * Vercel serverless: Hobby ~10s max unless project uses Pro Fluid Compute with a higher limit.
 * Poll touches DB + KIE/PiAPI + optional download/re-upload of media per row — keep row cap below.
 */
export const maxDuration = 60;

type Body = {
  kind?: string;
  personalApiKey?: string;
  piapiApiKey?: string;
};

const LIBRARY_KINDS = [
  "avatar",
  "studio_image",
  "studio_video",
  "studio_upscale",
  "motion_control",
  "studio_watermark",
] as const;

/** Avoid Vercel timeouts when many jobs are in flight (each row may download+re-upload media). */
const MAX_ROWS_TO_POLL_PER_REQUEST = 8;

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
    } else if (resolvedKinds.length === 1) {
      procQuery = procQuery.eq("kind", resolvedKinds[0]!);
    } else {
      procQuery = procQuery.in("kind", resolvedKinds);
    }

    procQuery = procQuery.order("created_at", { ascending: true }).limit(MAX_ROWS_TO_POLL_PER_REQUEST);

    const { data: processing, error: procErr } = await procQuery;

    if (procErr) throw procErr;

    const processingRows = (processing ?? []) as StudioGenerationRow[];
    for (const row of processingRows) {
      try {
        await pollStudioGenerationRow(row, personalApiKey, piapiApiKey, supabase);
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

    let listQuery = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (resolvedKinds === "all") {
      listQuery = listQuery.in("kind", [...LIBRARY_KINDS]);
    } else if (resolvedKinds.length === 1) {
      listQuery = listQuery.eq("kind", resolvedKinds[0]!);
    } else {
      listQuery = listQuery.in("kind", resolvedKinds);
    }

    const { data: all, error: listErr } = await listQuery;

    if (listErr) throw listErr;

    const items = ((all ?? []) as StudioGenerationRow[]).map(studioGenerationRowToHistoryItem);
    return NextResponse.json({ data: items, refundHints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    serverLog("studio_generations_poll_error", { message: message.slice(0, 240) });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
