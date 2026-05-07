export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, ttListAdvertiserAds } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60;

/** TrendTrack brandtracker endpoints require a canonical UUID (v4/v7). */
function isCanonicalUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const key = `tracker:${id}:top-ads:v2`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    // The brandtrackers endpoint requires a UUID. When the saved id is a numeric
    // advertiser/lookup id (pre-UUID workspace), fall back to the advertiser ads route.
    const data = isCanonicalUuid(id)
      ? await ttGetTopAds(id, 10)
      : await ttListAdvertiserAds(id, { limit: 10, sortBy: "reach", order: "desc" });
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
