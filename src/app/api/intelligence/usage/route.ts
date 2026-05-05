export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetUsage } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 5;
const KEY = "usage:summary";

export async function GET() {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const cached = await getCached(KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttGetUsage();
    await setCached(KEY, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, KEY);
  }
}
