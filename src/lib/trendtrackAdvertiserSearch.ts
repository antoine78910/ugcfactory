import type { TTLookupResult } from "@/lib/trendtrack";

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function num(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[, ]+/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Merge top-level row with nested advertiser / page blob if present */
function advertiserShard(o: Record<string, unknown>): Record<string, unknown> {
  const keys = ["advertiser", "Advertiser", "page", "Page", "brand", "Brand", "sponsor", "Sponsor"];
  const base = { ...o };
  for (const k of keys) {
    const v = base[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return { ...base, ...(v as Record<string, unknown>) };
    }
  }
  return base;
}

/**
 * Normalize a single `/v1/lookup` row – TrendTrack may use snake_case, nested objects,
 * or advertiser-oriented field names depending on workspace / API version.
 */
export function normalizeTTLookupRow(raw: unknown): TTLookupResult | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const m = advertiserShard(o);

  const id =
    str(
      m.id,
      m.advertiser_id,
      m.advertiserId,
      m.page_id,
      m.pageId,
      m.meta_page_id,
      m.metaPageId,
      o.id,
      o.advertiser_id,
      o.page_id,
    ) ?? "";
  if (!id) return null;

  const domainRaw = str(
    m.domain,
    m.website_domain,
    m.websiteDomain,
    m.hostname,
    o.domain,
    o.website_domain,
  );
  const domain =
    domainRaw
      ?.replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.replace(/^www\./i, "")
      ?.trim() || undefined;

  const name =
    str(
      m.name,
      m.display_name,
      m.displayName,
      m.page_name,
      m.pageName,
      m.advertiser_name,
      m.advertiserName,
      m.brand_name,
      m.brandName,
      m.title,
      m.label,
      m.company_name,
      m.companyName,
      o.name,
      o.page_name,
    ) ??
    domain ??
    `Advertiser ${id.slice(-8)}`;

  const typeRaw = str(m.type, m.kind, m.entity_type, m.entityType, o.type) ?? "advertiser";

  const logo =
    str(
      m.logo,
      m.logo_url,
      m.logoUrl,
      m.picture,
      m.profile_picture_url,
      m.profilePictureUrl,
      m.profile_pic,
      m.profilePic,
      m.image_url,
      m.imageUrl,
      o.logo,
      o.logo_url,
    ) ?? undefined;
  const logoUrl = logo;

  return { id, name, type: typeRaw, ...(domain ? { domain } : {}), ...(logo ? { logo } : {}), ...(logoUrl ? { logoUrl } : {}) };
}

/** One row returned by TrendTrack `/v1/ads/query` aggregated by advertiser/page */
export type TTAdvertiserFromAdsRow = {
  id: string;
  name: string;
  domain?: string;
  logo?: string;
  followerCount?: number;
  adCount: number;
  maxReach: number;
};

function extractAdvertiserFromAdRaw(raw: unknown): Omit<TTAdvertiserFromAdsRow, "adCount" | "maxReach"> | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const m = advertiserShard(o);

  const id =
    str(
      m.advertiser_id,
      m.advertiserId,
      m.page_id,
      m.pageId,
      m.id,
      o.advertiser_id,
      o.advertiserId,
      o.page_id,
    ) ?? "";
  if (!id) return null;

  const domainRaw =
    str(
      m.website_domain,
      m.websiteDomain,
      m.external_website,
      m.externalWebsite,
      m.destination_url_domain,
      m.domain,
      o.domain,
    ) ??
    undefined;
  const domain = domainRaw
    ? domainRaw.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^www\./i, "").trim()
    : undefined;

  const name =
    str(
      m.page_name,
      m.pageName,
      m.advertiser_name,
      m.advertiserName,
      m.advertiser,
      // sometimes string advertiser name leaks on root
      o.advertiser_name,
      o.advertiserName,
      o.page_name,
    ) ??
    domain ??
    undefined;
  if (!name) return null;

  const followerCount =
    num(
      m.fan_count,
      m.fanCount,
      m.followers_count,
      m.followersCount,
      m.page_followers,
      m.pageFollowers,
      m.follower_count,
      m.followerCount,
      m.ig_followers,
      m.igFollowers,
      m.instagram_followers,
      m.instagramFollowers,
    );

  const logo =
    str(
      m.logo,
      m.logo_url,
      m.logoUrl,
      m.profile_picture_url,
      m.profilePictureUrl,
      m.profile_pic,
      m.profilePic,
      m.picture,
      m.picture_url,
    ) ?? undefined;

  return {
    id,
    name,
    ...(domain ? { domain } : {}),
    ...(logo ? { logo } : {}),
    ...(followerCount !== undefined ? { followerCount } : {}),
  };
}

export function rollupAdvertisersFromAdsQueryRows(rows: unknown[]): Map<string, TTAdvertiserFromAdsRow> {
  const map = new Map<string, TTAdvertiserFromAdsRow>();

  for (const raw of rows) {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const reach =
      num(
        o.reach,
        o.estimated_reach,
        o.estimatedReach,
        o.impressions,
        o.estimated_impressions,
        o.estimatedImpressions,
      ) ?? 0;

    const ex = extractAdvertiserFromAdRaw(raw);
    if (!ex) continue;

    const prev = map.get(ex.id);
    if (!prev) {
      map.set(ex.id, {
        id: ex.id,
        name: ex.name,
        ...(ex.domain ? { domain: ex.domain } : {}),
        ...(ex.logo ? { logo: ex.logo } : {}),
        ...(ex.followerCount !== undefined ? { followerCount: ex.followerCount } : {}),
        adCount: 1,
        maxReach: reach,
      });
      continue;
    }

    prev.adCount += 1;
    prev.maxReach = Math.max(prev.maxReach, reach);
    if (!prev.domain && ex.domain) prev.domain = ex.domain;
    if (!prev.logo && ex.logo) prev.logo = ex.logo;
    if (prev.followerCount === undefined && ex.followerCount !== undefined) prev.followerCount = ex.followerCount;
    prev.name = preferAdvertiserName(prev.name, ex.name);
  }

  return map;
}

function preferAdvertiserName(a: string, b: string): string {
  const generic = (s: string) => /^advertiser$/i.test(s.trim()) || /^unknown$/i.test(s.trim());
  if (generic(a) && !generic(b)) return b;
  if (generic(b) && !generic(a)) return a;
  return a.trim().length >= b.trim().length ? a : b;
}

/** Enriched competitor row shown in Competitors sidebar */
export type TTCompetitorSearchHit = TTLookupResult & {
  followerCount?: number;
  sampledAdCount?: number;
  maxReachSeen?: number;
  sources: Array<"lookup" | "ads">;
};

export function mergeLookupAndAdsAdvertisers(
  lookups: TTLookupResult[],
  rollups: Map<string, TTAdvertiserFromAdsRow>,
): TTCompetitorSearchHit[] {
  const byId = new Map<string, TTCompetitorSearchHit>();
  const lookupOrderIds: string[] = [];

  for (const l of lookups) {
    lookupOrderIds.push(l.id);
    const r = rollups.get(l.id);

    const sources: Array<"lookup" | "ads"> = ["lookup"];
    if (r && r.adCount > 0) sources.push("ads");

    const followerCount =
      typeof r?.followerCount === "number" && Number.isFinite(r.followerCount) ? r.followerCount : undefined;

    const nl = (l.name ?? "").trim();
    const na = (r?.name ?? "").trim();
    const name =
      preferAdvertiserName(nl, na).trim() || na || nl || (l.domain ?? "").trim() || `Advertiser ${l.id.slice(-8)}`;

    byId.set(l.id, {
      ...l,
      name,
      domain: l.domain ?? r?.domain,
      logo: (l.logo ?? l.logoUrl ?? r?.logo) || undefined,
      logoUrl: (l.logoUrl ?? l.logo ?? r?.logo) || undefined,
      followerCount,
      sampledAdCount: r?.adCount,
      maxReachSeen: r && r.maxReach > 0 ? r.maxReach : undefined,
      sources,
    });
  }

  for (const [id, r] of rollups) {
    if (byId.has(id)) continue;

    byId.set(id, {
      id,
      name: r.name,
      type: "advertiser",
      ...(r.domain ? { domain: r.domain } : {}),
      ...(r.logo ? { logo: r.logo, logoUrl: r.logo } : {}),
      followerCount: r.followerCount,
      sampledAdCount: r.adCount,
      maxReachSeen: r.maxReach > 0 ? r.maxReach : undefined,
      sources: ["ads"],
    });
  }

  const adsOnly: TTCompetitorSearchHit[] = [...byId.values()].filter(
    (h) => h.sources.length === 1 && h.sources[0] === "ads",
  );
  adsOnly.sort((a, b) => {
    const ra = b.maxReachSeen ?? 0;
    const rb = a.maxReachSeen ?? 0;
    if (ra !== rb) return ra - rb;
    return (a.name || "").localeCompare(b.name || "");
  });

  const lookupIdsUnique = [...new Set(lookupOrderIds)];
  const out: TTCompetitorSearchHit[] = [];
  for (const id of lookupIdsUnique) {
    const h = byId.get(id);
    if (h) out.push(h);
  }
  out.push(...adsOnly);
  return out;
}
