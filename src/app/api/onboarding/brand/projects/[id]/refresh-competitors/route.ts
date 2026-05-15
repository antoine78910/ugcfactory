export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";

import { claudeAnalyzeCompetitorsPack } from "@/lib/onboardingBrandClaude";
import {
  gatherCompetitorContextCached,
  type CompetitorRefreshTarget,
} from "@/lib/onboardingCompetitorGather";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import type { BrandCompetitorAnalysisRow } from "@/lib/onboardingBrandClaude";

type Body = {
  /** Refresh only one competitor by index (0-based). Omit to refresh all with stale/missing ads. */
  competitorIndex?: unknown;
  force?: unknown;
};

function parseCompetitorInputs(raw: unknown[]): CompetitorRefreshTarget[] {
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.input_name === "string" ? o.input_name.trim() : "";
      if (!name) return null;
      const domain = typeof o.input_domain === "string" ? o.input_domain.trim() : null;
      return { name, domain: domain || null };
    })
    .filter((x): x is CompetitorRefreshTarget => x !== null);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty */
  }

  const force = body.force === true;
  const singleIndex =
    typeof body.competitorIndex === "number" && Number.isInteger(body.competitorIndex)
      ? body.competitorIndex
      : null;

  const { data: row, error } = await auth.supabase!
    .from("brand_projects")
    .select("competitors, site_url, site_name, marketing_angles")
    .eq("id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const existing = Array.isArray(row.competitors) ? row.competitors : [];
  const inputs = parseCompetitorInputs(existing);

  if (inputs.length === 0) {
    return NextResponse.json({ error: "No competitors on this project." }, { status: 400 });
  }

  const indices =
    singleIndex !== null
      ? singleIndex >= 0 && singleIndex < inputs.length
        ? [singleIndex]
        : []
      : inputs.map((_, i) => i);

  if (indices.length === 0) {
    return NextResponse.json({ error: "Invalid competitor index." }, { status: 400 });
  }

  const refreshed: BrandCompetitorAnalysisRow[] = [...(existing as BrandCompetitorAnalysisRow[])];
  let ttCalls = 0;

  for (const i of indices) {
    const target = inputs[i]!;
    const prev = refreshed[i];
    const needsRefresh =
      force ||
      !prev ||
      !Array.isArray(prev.trendtrack_ads) ||
      (prev.trendtrack_ads?.length ?? 0) === 0;

    if (!needsRefresh && singleIndex === null) continue;

    const gathered = await gatherCompetitorContextCached(target, { force });
    ttCalls += gathered.ttCalls;
    const ctxRow = gathered.row;

    const siteUrl = typeof row.site_url === "string" ? row.site_url : "";
    const siteName = typeof row.site_name === "string" ? row.site_name : null;
    const yourAngles = Array.isArray(row.marketing_angles)
      ? (row.marketing_angles as Array<{ label?: string }>).map((a) => a.label ?? "").filter(Boolean)
      : [];

    const yourSummary =
      typeof row.site_name === "string" && row.site_name.trim()
        ? row.site_name.trim()
        : siteUrl;

    const pack = await claudeAnalyzeCompetitorsPack({
      yourSiteUrl: siteUrl,
      yourSummary,
      rows: [ctxRow],
    });
    refreshed[i] = pack.competitors[0] ?? ctxRow;
  }

  const now = new Date().toISOString();
  const { data: updated, error: saveErr } = await auth.supabase!
    .from("brand_projects")
    .update({ competitors: refreshed, updated_at: now })
    .eq("id", projectId)
    .select("*")
    .maybeSingle();

  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({
    project: updated,
    refreshedIndices: indices,
    approximateTrendTrackCalls: ttCalls,
    message:
      ttCalls === 0
        ? "Used cached TrendTrack data — no new API calls."
        : `Refreshed ${indices.length} competitor(s). ~${ttCalls} TrendTrack call(s).`,
  });
}
