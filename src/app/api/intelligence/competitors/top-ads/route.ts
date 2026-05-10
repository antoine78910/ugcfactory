export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, ttListAdvertiserAds, ttListTrackers, ttQueryAds, type TTAd } from "@/lib/trendtrack";
import { intelligenceUiSortToAdsQuerySort, intelligenceUiSortToAdvertiserAdsSort } from "@/lib/trendtrackAdsQuerySort";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

// Keep competitor top ads cached for one week to reduce provider credit usage.
const TTL = 7 * 24 * 60 * 60;
const TRACKERS_KEY = "trackers:workspace:list";

const SORT_BY_SET = new Set([
  "currentRank",
  "reach",
  "reachDelta1d",
  "reachDelta7d",
  "reachDelta30d",
  "rankDelta7d",
  "rankDelta14d",
  "rankDelta30d",
  "longestRunning",
]);

/** Bump when competitor routing/body semantics change so Supabase cache is not polluted. */
const CACHE_REVISION = "v3";

function looksLikeDomain(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(" ")) return false;
  // not a perfect domain validator; good enough to choose searchType.
  return /[a-z0-9-]+\.[a-z]{2,}$/i.test(t);
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const url = new URL(req.url);
  const lookupId = (url.searchParams.get("lookupId") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const sortByRaw = (url.searchParams.get("sortBy") ?? "").trim();
  const sortBy = SORT_BY_SET.has(sortByRaw) ? sortByRaw : "";
  const force = url.searchParams.get("force") === "true";

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  if (!sortBy) return NextResponse.json({ error: "Missing or invalid sortBy" }, { status: 400 });

  const qHash = createHash("sha256").update(q.toLowerCase()).digest("hex").slice(0, 12);
  const key = lookupId
    ? `competitor:${lookupId}:${sortBy}:top:${CACHE_REVISION}`
    : `competitor:q:${qHash}:${sortBy}:top:${CACHE_REVISION}`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    // Reuse the same cached trackers list key as /api/intelligence/trackers to avoid extra credits.
    let trackers = await getCached<Array<{ id?: string }>>(TRACKERS_KEY);
    if (!trackers) {
      trackers = await ttListTrackers();
      await setCached(TRACKERS_KEY, trackers, TTL);
    }
    const trackedIds = new Set(
      (trackers ?? []).map((t) => String((t as any)?.id ?? "").trim()).filter(Boolean),
    );

    const isTracked = Boolean(lookupId && trackedIds.has(lookupId));

    // Workspace trackers: canonical brandtracker rankings (supports full top-ads sort enum).
    if (isTracked && lookupId) {
      const ads = await ttGetTopAds(lookupId, 10, sortBy);
      const payload = {
        source: "tracker_top_ads" as const,
        isTracked: true,
        sortBy,
        ads,
      };
      await setCached(key, payload, TTL);
      return NextResponse.json(payload);
    }

    const searchType = looksLikeDomain(q) ? "domain" : "brand";
    const adsQuerySortBy = intelligenceUiSortToAdsQuerySort(sortBy);

    // For non-tracked competitors, prioritize query-based ads on the searched brand/domain text.
    // This avoids broad advertiser matches when lookupId resolves to a nearby but wrong entity.
    if (lookupId) {
      const advSort = intelligenceUiSortToAdvertiserAdsSort(sortBy);
      const queriedAds: TTAd[] = await ttQueryAds({
        searchType,
        q,
        sortBy: adsQuerySortBy,
        limit: 10,
      });
      if (Array.isArray(queriedAds) && queriedAds.length > 0) {
        const payload = {
          source: "ads_query" as const,
          isTracked,
          sortBy,
          adsQuerySortBy,
          ads: queriedAds,
        };
        await setCached(key, payload, TTL);
        return NextResponse.json(payload);
      }
      // Fallback to advertiser listing if text query has no ads.
      const ads = await ttListAdvertiserAds(lookupId, { limit: 10, sortBy: advSort, order: "desc" });
      const payload = {
        source: "advertiser_ads" as const,
        isTracked,
        /** User-facing Intelligence sort. */
        sortBy,
        /** Actual `sortBy` sent to TrendTrack advertiser ads listing. */
        advertiserAdsSortBy: advSort,
        ads,
      };
      await setCached(key, payload, TTL);
      return NextResponse.json(payload);
    }

    const ads: TTAd[] = await ttQueryAds({
      searchType,
      q,
      sortBy: adsQuerySortBy,
      limit: 10,
    });
    const payload = {
      source: "ads_query" as const,
      isTracked,
      /** User-selected Intelligence sort (UI / cache key). */
      sortBy,
      /** Actual `sortBy` sent to TrendTrack POST /v1/ads/query (narrower enum). */
      adsQuerySortBy,
      ads,
    };
    await setCached(key, payload, TTL);
    return NextResponse.json(payload);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}

