export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { TrendTrackError, ttLookup, ttQueryAdvertisers } from "@/lib/trendtrack";
import type { TTLookupResult } from "@/lib/trendtrack";
import {
  mapAdvertiserQueryRowsToLookups,
  normalizeCachedLookupRows,
  trendTrackQueryLooksLikeDomain,
  trendTrackStripHostQuery,
} from "@/lib/trendtrackBrandDiscovery";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60 * 24;

function normalizeLookupQuery(raw: string): string {
  const q = raw.trim();
  if (!q) return "";
  // If user pasted a URL, reduce it to hostname (TrendTrack lookup times out on long URLs).
  try {
    const looksUrl = /^https?:\/\//i.test(q) || q.startsWith("//");
    const u = new URL(looksUrl ? (q.startsWith("//") ? `https:${q}` : q) : `https://${q}`);
    const host = (u.hostname || "").replace(/^www\./i, "").trim();
    return host || q;
  } catch {
    return q.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.trim() || q;
  }
}

/**
 * Step 1 of brand discovery: `POST /v1/advertisers/query` (active ads sort, top matches, stable page ids).
 * Falls back to zero-credit `/v1/lookup` when the advertiser index returns nothing.
 */
async function searchAdvertisersForBar(q: string): Promise<TTLookupResult[]> {
  const searchType = trendTrackQueryLooksLikeDomain(q) ? "domain" : "brand";
  const searchTerm = searchType === "domain" ? trendTrackStripHostQuery(q) : q.trim();
  if (!searchTerm) return [];

  const rows = await ttQueryAdvertisers({
    search: [searchTerm],
    searchType,
    sortBy: "activeAds",
    order: "desc",
    limit: 3,
    offset: 0,
  });
  const mapped = mapAdvertiserQueryRowsToLookups(rows);
  return mapped;
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const rawQ = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!rawQ) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  const q = normalizeLookupQuery(rawQ);
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const lookupType = new URL(req.url).searchParams.get("type")?.trim() ?? "";
  const key = `lookup:v6:${lookupType || "_"}:${q.toLowerCase()}`;

  const cached = await getCached(key);
  if (cached) return NextResponse.json(normalizeCachedLookupRows(cached));

  try {
    if (lookupType === "advertiser") {
      const fromAdvertiserQuery = await searchAdvertisersForBar(q);
      if (fromAdvertiserQuery.length > 0) {
        await setCached(key, fromAdvertiserQuery, TTL);
        return NextResponse.json(fromAdvertiserQuery);
      }
      const lookupOpts = { type: "advertiser" as const };
      const data = await ttLookup(q, lookupOpts);
      await setCached(key, data, TTL);
      return NextResponse.json(data);
    }

    const lookupOpts = lookupType ? { type: lookupType } : undefined;
    const data = await ttLookup(q, lookupOpts);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    // Retry once with a narrower query if user pasted a full URL.
    if (err instanceof TrendTrackError && err.status === 504) {
      const fallback = normalizeLookupQuery(rawQ);
      if (fallback && fallback !== q) {
        try {
          const keyFb = `lookup:v6:${lookupType || "_"}:${fallback.toLowerCase()}`;
          if (lookupType === "advertiser") {
            const fromAdvertiserQuery = await searchAdvertisersForBar(fallback);
            if (fromAdvertiserQuery.length > 0) {
              await setCached(keyFb, fromAdvertiserQuery, TTL);
              return NextResponse.json(fromAdvertiserQuery);
            }
            const data = await ttLookup(fallback, { type: "advertiser" });
            await setCached(keyFb, data, TTL);
            return NextResponse.json(data);
          }
          const lookupOpts = lookupType ? { type: lookupType } : undefined;
          const data = await ttLookup(fallback, lookupOpts);
          await setCached(keyFb, data, TTL);
          return NextResponse.json(data);
        } catch {
          // fallthrough to structured error below
        }
      }
    }
    return respondTrendTrackError(err, key);
  }
}
