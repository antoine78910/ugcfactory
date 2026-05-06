/**
 * `POST /v1/ads/query` accepts a narrower `sortBy` set than `GET .../top-ads`.
 * Canonical list: https://docs.trendtrack.io/docs/llms-full.txt (section ads/query).
 */

export const TT_ADS_QUERY_SORT_BY_VALUES = [
  "createdAt",
  "longestRunning",
  "relevance",
  "relevanceScore",
  "newest",
  "mostDuplicates",
  "reach",
  "reachDelta1d",
  "reachDelta7d",
  "reachDelta30d",
  "adOrder",
] as const;

export type TTAdsQuerySortBy = (typeof TT_ADS_QUERY_SORT_BY_VALUES)[number];

const VALID = new Set<string>(TT_ADS_QUERY_SORT_BY_VALUES);

/**
 * Map Intelligence UI / top-ads sort keys to a valid `sortBy` for `POST /v1/ads/query`.
 * top-ads-only values (e.g. currentRank, rankDelta*) are approximated to the closest ads/query option.
 */
export function intelligenceUiSortToAdsQuerySort(uiSortBy: string): TTAdsQuerySortBy {
  const s = uiSortBy.trim();
  if (VALID.has(s)) return s as TTAdsQuerySortBy;
  switch (s) {
    case "currentRank":
      return "relevance";
    case "rankDelta7d":
      return "reachDelta7d";
    case "rankDelta14d":
      return "reachDelta30d";
    case "rankDelta30d":
      return "reachDelta30d";
    default:
      return "relevance";
  }
}

const ADVERTISER_ADS_SORT = new Set(["newest", "createdAt", "longestRunning", "reach", "duplicates"]);

/**
 * `GET /v1/advertisers/{id}/ads` supports a smaller sort set than brandtracker top-ads.
 */
export function intelligenceUiSortToAdvertiserAdsSort(uiSortBy: string): string {
  const s = uiSortBy.trim();
  if (ADVERTISER_ADS_SORT.has(s)) return s;
  switch (s) {
    case "currentRank":
    case "rankDelta7d":
    case "rankDelta14d":
    case "rankDelta30d":
      return "reach";
    case "reach":
    case "reachDelta1d":
    case "reachDelta7d":
    case "reachDelta30d":
      return "reach";
    case "longestRunning":
      return "longestRunning";
    default:
      return "reach";
  }
}
