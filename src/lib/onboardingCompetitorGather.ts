import { createHash } from "crypto";

import { crawlSiteForOnboarding, normalizeBrandSiteUrl } from "@/lib/onboardingSiteCrawler";
import { ttLookup, ttQueryAds, type TTAd, type TTLookupResult } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { trendTrackQueryLooksLikeDomain, trendTrackStripHostQuery } from "@/lib/trendtrackBrandDiscovery";
import type { BrandCompetitorAnalysisRow } from "@/lib/onboardingBrandClaude";

export type CompetitorRefreshTarget = { name: string; domain: string | null };

const LOOKUP_TTL = 60 * 60 * 24;
const ADS_QUERY_TTL = 60 * 60 * 24 * 7;

function adsQueryCacheKey(search: string[], searchType: string): string {
  const h = createHash("sha256")
    .update(JSON.stringify({ search, searchType, sortBy: "reachDelta7d", limit: 10 }))
    .digest("hex")
    .slice(0, 20);
  return `onboarding:ads_query:${h}`;
}

function pickLookupQuery(name: string, domain?: string | null): string {
  const d = domain?.trim() ?? "";
  if (d && trendTrackQueryLooksLikeDomain(d)) return trendTrackStripHostQuery(d);
  return name.trim();
}

function compactAd(a: TTAd) {
  return {
    headline: a.headline,
    title: a.title,
    body: a.body,
    text: a.text,
    platform: a.platform,
    reach: a.reach,
    videoUrl: a.videoUrl,
  };
}

async function fetchHomepageSnippet(domainOrUrl: string): Promise<string> {
  try {
    const origin = normalizeBrandSiteUrl(domainOrUrl);
    const { pages } = await crawlSiteForOnboarding(origin);
    const first = pages[0];
    return (first?.textSample ?? "").slice(0, 9000);
  } catch {
    return "";
  }
}

export async function gatherCompetitorContext(opts: {
  name: string;
  domain?: string | null;
}): Promise<BrandCompetitorAnalysisRow> {
  const input_name = opts.name.trim();
  const input_domain = opts.domain?.trim() || null;
  const q = pickLookupQuery(input_name, input_domain);

  let trendtrack_lookup: TTLookupResult | null = null;
  let trendtrack_ads: BrandCompetitorAnalysisRow["trendtrack_ads"] = [];

  try {
    const lookups = await ttLookup(q, { type: "advertiser" });
    trendtrack_lookup = lookups[0] ?? null;
  } catch {
    try {
      const lookups = await ttLookup(q);
      trendtrack_lookup = lookups[0] ?? null;
    } catch {
      trendtrack_lookup = null;
    }
  }

  const adsQuery =
    (input_domain && trendTrackQueryLooksLikeDomain(input_domain)
      ? trendTrackStripHostQuery(input_domain)
      : q) || input_name;

  try {
    const searchType = trendTrackQueryLooksLikeDomain(adsQuery) ? ("domain" as const) : ("brand" as const);
    const search = searchType === "domain" ? [trendTrackStripHostQuery(adsQuery)] : [adsQuery.trim()];
    const ads = await ttQueryAds({
      search,
      searchType,
      sortBy: "reachDelta7d",
      order: "desc",
      limit: 14,
    });
    trendtrack_ads = ads.map(compactAd);
  } catch {
    trendtrack_ads = [];
  }

  const siteSeed =
    (input_domain && trendTrackQueryLooksLikeDomain(input_domain) ? input_domain : null) ??
    trendtrack_lookup?.domain ??
    null;
  let website_text_sample = "";
  if (siteSeed) {
    website_text_sample = await fetchHomepageSnippet(siteSeed);
  }

  return {
    input_name,
    input_domain,
    trendtrack_lookup,
    trendtrack_ads,
    website_text_sample: website_text_sample || undefined,
    claude: {
      summary: "Pending synthesis.",
      ad_patterns: [],
      angles_they_stress: [],
      gaps_you_can_attack: [],
    },
  };
}

/** Credit-efficient gather: shared intelligence_cache for lookup + ads/query (limit 10). */
export async function gatherCompetitorContextCached(
  opts: CompetitorRefreshTarget,
  options?: { force?: boolean },
): Promise<{ row: BrandCompetitorAnalysisRow; ttCalls: number }> {
  const input_name = opts.name.trim();
  const input_domain = opts.domain?.trim() || null;
  const q = pickLookupQuery(input_name, input_domain);
  let ttCalls = 0;

  const lookupKey = `lookup:${q.toLowerCase()}`;
  let trendtrack_lookup: TTLookupResult | null = null;

  if (!options?.force) {
    const cachedLookup = await getCached<TTLookupResult[]>(lookupKey);
    if (cachedLookup?.length) trendtrack_lookup = cachedLookup[0] ?? null;
  }

  if (!trendtrack_lookup) {
    ttCalls += 1;
    try {
      const lookups = await ttLookup(q, { type: "advertiser" });
      trendtrack_lookup = lookups[0] ?? null;
      if (lookups.length > 0) await setCached(lookupKey, lookups, LOOKUP_TTL);
    } catch {
      try {
        const lookups = await ttLookup(q);
        trendtrack_lookup = lookups[0] ?? null;
        if (lookups.length > 0) await setCached(lookupKey, lookups, LOOKUP_TTL);
      } catch {
        trendtrack_lookup = null;
      }
    }
  }

  const adsQuery =
    (input_domain && trendTrackQueryLooksLikeDomain(input_domain)
      ? trendTrackStripHostQuery(input_domain)
      : q) || input_name;

  const searchType = trendTrackQueryLooksLikeDomain(adsQuery) ? ("domain" as const) : ("brand" as const);
  const search = searchType === "domain" ? [trendTrackStripHostQuery(adsQuery)] : [adsQuery.trim()];
  const adsKey = adsQueryCacheKey(search, searchType);

  let trendtrack_ads: BrandCompetitorAnalysisRow["trendtrack_ads"] = [];
  if (!options?.force) {
    const cachedAds = await getCached<TTAd[]>(adsKey);
    if (cachedAds?.length) trendtrack_ads = cachedAds.map(compactAd);
  }

  if (trendtrack_ads.length === 0) {
    ttCalls += 1;
    try {
      const ads = await ttQueryAds({
        search,
        searchType,
        sortBy: "reachDelta7d",
        order: "desc",
        limit: 10,
      });
      trendtrack_ads = ads.map(compactAd);
      if (ads.length > 0) await setCached(adsKey, ads, ADS_QUERY_TTL);
    } catch {
      trendtrack_ads = [];
    }
  }

  const siteSeed =
    (input_domain && trendTrackQueryLooksLikeDomain(input_domain) ? input_domain : null) ??
    trendtrack_lookup?.domain ??
    null;
  let website_text_sample = "";
  if (siteSeed) {
    website_text_sample = await fetchHomepageSnippet(siteSeed);
  }

  return {
    row: {
      input_name,
      input_domain,
      trendtrack_lookup,
      trendtrack_ads,
      website_text_sample: website_text_sample || undefined,
      claude: {
        summary: "Pending synthesis.",
        ad_patterns: [],
        angles_they_stress: [],
        gaps_you_can_attack: [],
      },
    },
    ttCalls,
  };
}
