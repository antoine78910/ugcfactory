export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, ttListAdvertiserAds, ttListTrackers, ttQueryAds, type TTAd } from "@/lib/trendtrack";
import {
  trendTrackQueryLooksLikeDomain,
  trendTrackStripHostQuery,
} from "@/lib/trendtrackBrandDiscovery";
import {
  intelligenceUiSortToAdsQuerySort,
  intelligenceUiSortToAdvertiserAdsSort,
  type TTAdsQuerySortBy,
} from "@/lib/trendtrackAdsQuerySort";
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
const CACHE_REVISION = "v5";

/**
 * Step 2 — `POST /v1/ads/query`: default "top creatives" sort is 7d reach growth (`reachDelta7d`),
 * matching the product flow described as `trend_signal: reach_growth_7d` + `active_only`.
 */
function competitorAdsQuerySortBy(uiSort: string): TTAdsQuerySortBy {
  if (uiSort === "currentRank") return "reachDelta7d";
  return intelligenceUiSortToAdsQuerySort(uiSort);
}

/**
 * Build TrendTrack `search` + `searchType` from explicit name/domain (preferred) and legacy `q`.
 * Prefer brand **name** for copy/brand search so results match the competitor the user picked.
 */
function resolveAdsQueryTerms(
  q: string,
  nameParam: string,
  domainParam: string,
): { searchTerms: string[]; searchType: "brand" | "domain" } {
  const domainHint = domainParam.trim();
  if (domainHint && trendTrackQueryLooksLikeDomain(domainHint)) {
    return { searchTerms: [trendTrackStripHostQuery(domainHint)], searchType: "domain" };
  }
  const qTrim = q.trim();
  const name = nameParam.trim();
  if (name) {
    if (trendTrackQueryLooksLikeDomain(name)) {
      return { searchTerms: [trendTrackStripHostQuery(name)], searchType: "domain" };
    }
    return { searchTerms: [name], searchType: "brand" };
  }
  if (qTrim && trendTrackQueryLooksLikeDomain(qTrim)) {
    return { searchTerms: [trendTrackStripHostQuery(qTrim)], searchType: "domain" };
  }
  if (qTrim) {
    return { searchTerms: [qTrim], searchType: "brand" };
  }
  return { searchTerms: [], searchType: "brand" };
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const url = new URL(req.url);
  const lookupId = (url.searchParams.get("lookupId") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const nameParam = (url.searchParams.get("name") ?? "").trim();
  const domainParam = (url.searchParams.get("domain") ?? "").trim();
  const sortByRaw = (url.searchParams.get("sortBy") ?? "").trim();
  const sortBy = SORT_BY_SET.has(sortByRaw) ? sortByRaw : "";
  const force = url.searchParams.get("force") === "true";

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  if (!sortBy) return NextResponse.json({ error: "Missing or invalid sortBy" }, { status: 400 });

  const fp = createHash("sha256")
    .update(`${q.toLowerCase()}|${nameParam.toLowerCase()}|${domainParam.toLowerCase()}`)
    .digest("hex")
    .slice(0, 12);
  const qHash = createHash("sha256").update(q.toLowerCase()).digest("hex").slice(0, 12);
  const key = lookupId
    ? `competitor:${lookupId}:${sortBy}:${fp}:top:${CACHE_REVISION}`
    : `competitor:q:${qHash}:${sortBy}:${fp}:top:${CACHE_REVISION}`;

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
      (trackers ?? []).map((t) => String((t as { id?: string }).id ?? "").trim()).filter(Boolean),
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

    const adsQuerySortBy = competitorAdsQuerySortBy(sortBy);
    const { searchTerms, searchType } = resolveAdsQueryTerms(q, nameParam, domainParam);

    // Step 2 — scoped `ads/query`: active creatives, optional brand/domain terms, page id filter, growth-friendly sort.
    if (lookupId) {
      const advSort = intelligenceUiSortToAdvertiserAdsSort(sortBy);
      const queryBody: Record<string, unknown> = {
        sortBy: adsQuerySortBy,
        status: "active",
        limit: 10,
        order: "desc",
        trackedPages: [lookupId],
      };
      if (searchTerms.length > 0) {
        queryBody.search = searchTerms;
        queryBody.searchType = searchType;
      }

      const queriedAds: TTAd[] = await ttQueryAds(queryBody);
      if (queriedAds.length > 0) {
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

      const scoped = await ttListAdvertiserAds(lookupId, {
        limit: 10,
        sortBy: advSort,
        order: "desc",
        status: "active",
      });
      const payload = {
        source: "advertiser_ads" as const,
        isTracked,
        sortBy,
        advertiserAdsSortBy: advSort,
        ads: scoped,
      };
      await setCached(key, payload, TTL);
      return NextResponse.json(payload);
    }

    if (searchTerms.length === 0) {
      return NextResponse.json(
        { error: "Missing searchable brand or domain", ads: [] as TTAd[], sortBy, isTracked },
        { status: 400 },
      );
    }

    const ads: TTAd[] = await ttQueryAds({
      search: searchTerms,
      searchType,
      sortBy: adsQuerySortBy,
      status: "active",
      limit: 10,
      order: "desc",
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
