export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttListTrackers } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60;
const KEY = "trackers:list";

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const force = new URL(req.url).searchParams.get("force") === "true";
  if (force) await deleteCached(KEY);

  const cached = await getCached(KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttListTrackers();
    await setCached(KEY, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
