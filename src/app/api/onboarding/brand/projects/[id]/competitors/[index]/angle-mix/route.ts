export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import { classifyCompetitorAds } from "@/lib/classifyCompetitorAds";
import { fetchCompetitorAdsForMix } from "@/lib/fetchCompetitorAdsForMix";
import { computeAngleMix } from "@/lib/marketAngleMix";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

function parseCompetitor(raw: unknown, index: number) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.input_name === "string" ? o.input_name.trim() : "";
  if (!name) return null;
  const domain = typeof o.input_domain === "string" ? o.input_domain.trim() : "";
  return { index, name, domain };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id: projectId, index: indexRaw } = await ctx.params;
  const index = Number.parseInt(indexRaw, 10);
  if (!Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Invalid competitor index." }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "true";

  const { data: row, error } = await auth.supabase!
    .from("brand_projects")
    .select("competitors, marketing_angles, site_name, title")
    .eq("id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const competitors = Array.isArray(row.competitors) ? row.competitors : [];
  const competitor = parseCompetitor(competitors[index], index);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const yourAngles = Array.isArray(row.marketing_angles)
    ? (row.marketing_angles as Array<{ label?: string }>).map((a) => a.label ?? "").filter(Boolean)
    : [];

  try {
    const { payload: rawPayload, fromCache: adsFromCache, ttCalled } = await fetchCompetitorAdsForMix({
      projectId,
      domain: competitor.domain,
      name: competitor.name,
      force,
    });

    const { ads: classified, fromCache: classifiedFromCache } = await classifyCompetitorAds({
      projectId,
      domain: rawPayload.domain,
      ads: rawPayload.ads,
      force,
    });

    const mixResult = computeAngleMix(classified, yourAngles);
    const fetchedAt = new Date(rawPayload.fetchedAt);
    const nextFetch = new Date(fetchedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    return NextResponse.json({
      competitor: {
        index,
        name: competitor.name,
        domain: rawPayload.domain || competitor.domain || null,
      },
      yourBrand: (row.site_name as string | null)?.trim() || (row.title as string) || "Your brand",
      lastFetched: rawPayload.fetchedAt,
      nextFetch: nextFetch.toISOString(),
      totalAds: classified.length,
      fromCache: { ads: adsFromCache, classified: classifiedFromCache },
      trendTrackCalled: ttCalled,
      ...mixResult,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Angle mix failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
