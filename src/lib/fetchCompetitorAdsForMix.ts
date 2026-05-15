import { createHash } from "crypto";

import { getCached, setCached } from "@/lib/trendtrackCache";
import { ttQueryAds, type TTAd } from "@/lib/trendtrack";
import { trendTrackQueryLooksLikeDomain, trendTrackStripHostQuery } from "@/lib/trendtrackBrandDiscovery";
import type { MixCompetitorAd } from "@/lib/marketAngleMix";

const TTL_SECONDS = 7 * 24 * 60 * 60;

export type CachedCompetitorAdsPayload = {
  domain: string;
  ads: MixCompetitorAd[];
  fetchedAt: string;
};

function cacheKey(projectId: string, domain: string): string {
  const h = createHash("sha256").update(domain.toLowerCase()).digest("hex").slice(0, 16);
  return `brand-mix:raw:v1:${projectId}:${h}`;
}

function adCopy(ad: TTAd): string {
  const headline = (ad.headline ?? ad.title ?? "").trim();
  const body = (ad.body ?? ad.text ?? "").trim();
  return [headline, body].filter(Boolean).join(" — ").slice(0, 500);
}

function adFormat(ad: TTAd): "video" | "image" | "unknown" {
  if (ad.videoUrl?.trim()) return "video";
  if (ad.imageUrl?.trim() || ad.thumbnailUrl?.trim()) return "image";
  return "unknown";
}

function normalizeDomain(domain: string, name: string): string {
  const d = domain.trim();
  if (d && trendTrackQueryLooksLikeDomain(d)) return trendTrackStripHostQuery(d);
  if (name && trendTrackQueryLooksLikeDomain(name)) return trendTrackStripHostQuery(name);
  return d || name.trim();
}

export function toMixAd(ad: TTAd, index: number): MixCompetitorAd {
  const id = (ad.id ?? `ad-${index}`).toString();
  return {
    id,
    copy: adCopy(ad),
    headline: (ad.headline ?? ad.title ?? "").trim(),
    body: (ad.body ?? ad.text ?? "").trim(),
    reach: Number(ad.reach) > 0 ? Number(ad.reach) : 0,
    platform: (ad.platform ?? "meta").toString(),
    format: adFormat(ad),
    daysRunning: ad.daysRunning,
    videoUrl: ad.videoUrl,
    imageUrl: ad.imageUrl ?? ad.thumbnailUrl,
  };
}

/**
 * Fetch competitor ads via TrendTrack `POST /v1/ads/query` (domain search, reach sort).
 * Cached 7 days in `intelligence_cache` — no re-fetch when valid.
 */
export async function fetchCompetitorAdsForMix(opts: {
  projectId: string;
  domain: string;
  name: string;
  force?: boolean;
}): Promise<{ payload: CachedCompetitorAdsPayload; fromCache: boolean; ttCalled: boolean }> {
  const domain = normalizeDomain(opts.domain, opts.name);
  const key = cacheKey(opts.projectId, domain);

  if (!opts.force) {
    const cached = await getCached<CachedCompetitorAdsPayload>(key);
    if (cached?.ads && cached.fetchedAt) {
      return { payload: cached, fromCache: true, ttCalled: false };
    }
  }

  const searchType = trendTrackQueryLooksLikeDomain(domain) ? ("domain" as const) : ("brand" as const);
  const search = [domain];

  const rows = await ttQueryAds({
    search,
    searchType,
    sortBy: "reach",
    order: "desc",
    limit: 20,
    status: "active",
  });

  const payload: CachedCompetitorAdsPayload = {
    domain,
    ads: rows.map(toMixAd),
    fetchedAt: new Date().toISOString(),
  };

  await setCached(key, payload, TTL_SECONDS);
  return { payload, fromCache: false, ttCalled: true };
}
