export const runtime = "nodejs";
export const maxDuration = 180;

import { NextResponse } from "next/server";

import { claudeAnalyzeCompetitorsPack } from "@/lib/onboardingBrandClaude";
import { gatherCompetitorContext } from "@/lib/onboardingCompetitorGather";
import { normalizeBrandSiteUrl } from "@/lib/onboardingSiteCrawler";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

const MAX_COMPETITORS = 5;

type CompetitorInput = { name?: unknown; domain?: unknown };

type Body = {
  siteUrl?: unknown;
  brandSummary?: unknown;
  competitors?: unknown;
};

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const siteUrlRaw = typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
  const brandSummary =
    typeof body.brandSummary === "string" && body.brandSummary.trim()
      ? body.brandSummary.trim()
      : "Brand positioning not provided.";
  const list = Array.isArray(body.competitors) ? body.competitors : [];

  if (!siteUrlRaw) {
    return NextResponse.json({ error: "Missing siteUrl" }, { status: 400 });
  }
  if (list.length === 0) {
    return NextResponse.json({ error: "Add at least one competitor." }, { status: 400 });
  }
  if (list.length > MAX_COMPETITORS) {
    return NextResponse.json({ error: `Maximum ${MAX_COMPETITORS} competitors per run.` }, { status: 400 });
  }

  const parsed: { name: string; domain?: string | null }[] = [];
  for (const row of list as CompetitorInput[]) {
    if (!row || typeof row !== "object") continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const domain = typeof row.domain === "string" ? row.domain.trim() : null;
    if (!name) continue;
    parsed.push({ name, domain: domain || null });
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: "Each competitor needs a name." }, { status: 400 });
  }

  try {
    const siteUrl = normalizeBrandSiteUrl(siteUrlRaw);
    const rows = [];
    for (const c of parsed) {
      rows.push(await gatherCompetitorContext({ name: c.name, domain: c.domain }));
    }
    const { competitors } = await claudeAnalyzeCompetitorsPack({
      yourSiteUrl: siteUrl,
      yourSummary: brandSummary,
      rows,
    });
    return NextResponse.json({ competitors, model: "claude-sonnet-4-6" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Competitor analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
