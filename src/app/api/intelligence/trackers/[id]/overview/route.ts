export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetOverview } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60 * 24;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const key = `tracker:${id}:overview:v2`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  // The brandtrackers overview endpoint requires a canonical UUID (v4/v7).
  // For brands saved with a numeric advertiser/lookup id, we have no equivalent
  // overview endpoint — return empty stats instead of a TrendTrack 400.
  const isCanonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  if (!isCanonicalUuid) {
    const empty = {};
    await setCached(key, empty, TTL);
    return NextResponse.json(empty);
  }

  try {
    const data = await ttGetOverview(id);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
