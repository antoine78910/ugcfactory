export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttQueryAds } from "@/lib/trendtrack";
import { intelligenceUiSortToAdsQuerySort } from "@/lib/trendtrackAdsQuerySort";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60;

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "true";
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  const key = `ads:query:${hash}`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const sortRaw = body.sortBy;
    const sortByNormalized =
      typeof sortRaw === "string" ? intelligenceUiSortToAdsQuerySort(sortRaw) : undefined;
    const forwarded = {
      ...body,
      ...(typeof sortRaw === "string" ? { sortBy: sortByNormalized } : {}),
      limit: 10,
    };
    const data = await ttQueryAds(forwarded);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
