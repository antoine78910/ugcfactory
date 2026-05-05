export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { claudeMessagesText } from "@/lib/claudeResponses";
import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";

export type Opportunity = { title: string; description: string };

const TTL = 60 * 60 * 12;

function buildOpportunitiesPrompt(
  trackerName: string,
  competitorAngles: Angle[],
  ownAngles: Angle[]
): string {
  return `You are a creative strategist for e-commerce.

Own brand uses these creative angles: ${JSON.stringify(ownAngles.map((a) => a.label))}
Competitor "${trackerName}" uses these angles: ${JSON.stringify(competitorAngles.map((a) => a.label))}

Identify 5 untapped creative opportunities — angles the competitor uses heavily that the brand doesn't, or fresh angles neither exploits yet.

Return ONLY valid JSON — no markdown:
{"opportunities":[{"title":"Leverage social proof","description":"The competitor uses customer testimonials heavily. A UGC video format showing real customer reactions could differentiate your brand."}]}

Rules:
- Titles: action-oriented, max 6 words
- Descriptions: 1-2 sentences, concrete and actionable`;
}

function parseOpportunities(raw: string): Opportunity[] {
  try {
    const parsed = JSON.parse(raw) as { opportunities?: Opportunity[] };
    return parsed.opportunities ?? [];
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as { opportunities?: Opportunity[] };
      return parsed.opportunities ?? [];
    } catch {
      return [];
    }
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const trackerName = url.searchParams.get("name") ?? "Competitor";
  const ownIds = (url.searchParams.get("ownIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const competitorAngles = await getCached<Angle[]>(`tracker:${id}:angles`);
  if (!competitorAngles) {
    return NextResponse.json(
      { needsAngles: true, message: "Load this tracker's top ads first to compute angles." },
      { status: 202 }
    );
  }

  const ownAnglesArrays = await Promise.all(
    ownIds.map((tid) => getCached<Angle[]>(`tracker:${tid}:angles`))
  );
  const missingOwnIds = ownIds.filter((_, i) => !ownAnglesArrays[i]);
  if (missingOwnIds.length > 0 && ownIds.length > 0) {
    return NextResponse.json(
      {
        needsAngles: true,
        missingIds: missingOwnIds,
        message: "Visit your own trackers first to compute their angles.",
      },
      { status: 202 }
    );
  }
  const ownAngles = (ownAnglesArrays.filter(Boolean) as Angle[][]).flat();

  const cacheHash = createHash("sha256")
    .update(JSON.stringify({ competitorAngles, ownAngles }))
    .digest("hex")
    .slice(0, 12);
  const key = `tracker:${id}:opportunities:${cacheHash}`;

  if (force) await deleteCached(key);
  const cached = await getCached<Opportunity[]>(key);
  if (cached) return NextResponse.json(cached);

  try {
    const raw = await claudeMessagesText({
      user: buildOpportunitiesPrompt(trackerName, competitorAngles, ownAngles),
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });
    const opportunities = parseOpportunities(raw);
    await setCached(key, opportunities, TTL);
    return NextResponse.json(opportunities);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
