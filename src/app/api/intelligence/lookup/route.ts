export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttLookup } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60 * 24;

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const key = `lookup:${q.toLowerCase()}`;
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttLookup(q);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
