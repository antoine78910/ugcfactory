export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, ttListAdvertiserAds, type TTAd } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { claudeMessagesText } from "@/lib/claudeResponses";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

export type Angle = { label: string; pct: number };

const ANGLES_TTL = 60 * 60 * 6;
const TOPADS_TTL = 60 * 60;

function buildAnglesPrompt(ads: TTAd[]): string {
  const lines = ads
    .map((ad, i) => {
      const headline = (ad.headline ?? ad.title ?? "").slice(0, 120);
      const body = (ad.body ?? ad.text ?? "").slice(0, 200);
      return `[${i + 1}] "${headline}" — "${body}"`;
    })
    .join("\n");

  return `You are a creative performance analyst. Analyze these top-performing ads and identify the dominant creative angles.

Return ONLY valid JSON — no markdown, no explanation:
{"angles":[{"label":"Social proof","pct":35},{"label":"Urgency","pct":25}]}

Rules:
- 4 to 6 angles total
- pct values must sum to 100
- Labels: concise (2-4 words), in English

Ads:
${lines}`;
}

function parseAngles(raw: string): Angle[] {
  try {
    const parsed = JSON.parse(raw) as { angles?: Angle[] };
    return parsed.angles ?? [];
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as { angles?: Angle[] };
      return parsed.angles ?? [];
    } catch {
      return [];
    }
  }
}

/** TrendTrack brandtracker endpoints require a canonical UUID (v4/v7). */
function isCanonicalUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function fetchAdsForId(id: string): Promise<TTAd[]> {
  return isCanonicalUuid(id)
    ? ttGetTopAds(id, 10)
    : ttListAdvertiserAds(id, { limit: 10, sortBy: "reach", order: "desc" });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const anglesKey = `tracker:${id}:angles`;
  const topAdsKey = `tracker:${id}:top-ads:v2`;

  if (force) await deleteCached(anglesKey);
  const cached = await getCached<Angle[]>(anglesKey);
  if (cached) return NextResponse.json(cached);

  let ads = await getCached<TTAd[]>(topAdsKey);
  if (!ads) {
    try {
      ads = await fetchAdsForId(id);
      await setCached(topAdsKey, ads, TOPADS_TTL);
    } catch (err) {
      return respondTrendTrackError(err, topAdsKey);
    }
  }

  if (ads.length === 0) {
    await setCached(anglesKey, [], ANGLES_TTL);
    return NextResponse.json([]);
  }

  try {
    const raw = await claudeMessagesText({
      user: buildAnglesPrompt(ads),
      model: "claude-sonnet-4-6",
      maxTokens: 512,
    });
    const angles = parseAngles(raw);
    await setCached(anglesKey, angles, ANGLES_TTL);
    return NextResponse.json(angles);
  } catch (err) {
    return respondTrendTrackError(err, anglesKey);
  }
}
