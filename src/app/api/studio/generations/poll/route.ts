export const runtime = "nodejs";

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

type Body = {
  kind?: string;
  personalApiKey?: string;
  piapiApiKey?: string;
};

const LIBRARY_KINDS = ["avatar", "studio_image", "studio_video", "studio_upscale", "motion_control"] as const;

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
    let procQuery = supabase
      .from("studio_generations")
      .select("*")
      .eq("user_id", user.id)
      .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]);

    const resolvedKinds = resolvePollKinds(kind);
    if (resolvedKinds === "all") {
      procQuery = procQuery.in("kind", [...LIBRARY_KINDS]);
    } else if (resolvedKinds.length === 1) {
      procQuery = procQuery.eq("kind", resolvedKinds[0]!);
    } else {
      procQuery = procQuery.in("kind", resolvedKinds);
    }

    const { data: processing, error: procErr } = await procQuery;

    if (procErr) throw procErr;

    for (const row of (processing ?? []) as StudioGenerationRow[]) {
      try {
        await pollStudioGenerationRow(row, personalApiKey, piapiApiKey, supabase);
      } catch {
        /* one bad poll should not block others */
      }
    }

    let refundHints: { jobId: string; credits: number }[] = [];
    if (resolvedKinds === "all") {
      for (const k of LIBRARY_KINDS) {
        refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
      }
    } else {
      for (const k of resolvedKinds) {
        refundHints = refundHints.concat(await sweepStudioRefundHints(supabase, user.id, k));
      }
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
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
