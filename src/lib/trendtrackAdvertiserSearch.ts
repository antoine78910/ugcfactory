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
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Deep-merge nested lookup blobs TrendTrack wraps under advertiser/page/data — BFS so we cannot spin forever re-spreading the same object. */
function mergeLookupShards(o: Record<string, unknown>): Record<string, unknown> {
  const SHARD_KEYS = new Set(["advertiser", "Advertiser", "page", "Page", "brand", "Brand", "sponsor", "Sponsor", "data"]);
  let acc = { ...o };
  const seen = new Set<object>();
  const queue: Record<string, unknown>[] = [o];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (seen.size > 250) break;

    for (const [k, v] of Object.entries(cur)) {
      if (!SHARD_KEYS.has(k) || !v || typeof v !== "object" || Array.isArray(v)) continue;
      const inner = v as Record<string, unknown>;
      acc = { ...acc, ...inner };
      queue.push(inner);
    }
  }
  return acc;
}

function coerceDomainHostname(input: string | undefined): string | undefined {
  const raw = (input ?? "").trim();
  if (!raw) return undefined;
  const noProto = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0]?.trim() ?? "";
  if (!noProto) return undefined;
  const host = noProto.replace(/^www\./i, "").toLowerCase();
  // drop obvious junk
  if (host === "" || host === "localhost" || host.endsWith(".local")) return undefined;
  if (!host.includes(".")) return undefined;
  if (host.includes(" ")) return undefined;
  if (/@/.test(host)) return undefined;
  return host;
}

function hostnameFromFlexibleString(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  const s = val.trim();
  if (!s || s.length > 4096) return undefined;
  if (/^instagram\.com\/|^www\.instagram\.com\//i.test(s)) return "instagram.com";
  if (/^tiktok\.com\/|^www\.tiktok\.com\/@/i.test(s)) return "tiktok.com";
  // Drop obvious creative/static URLs so we prefer real site domains elsewhere in the payload.
  if (/\.(png|jpe?g|gif|webp|svg|mp4|webm)(\?|$)/i.test(s)) return undefined;

  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    if (!u.hostname || !u.hostname.includes(".")) return undefined;
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return coerceDomainHostname(s);
  }
}

function probablyCdnOrTrackerHost(h: string): boolean {
  return /amazonaws\.com|cloudfront\.net|bunnycdn\.|imgix\.net|cloudinary\.net|blob\.core\.windows\.net|img\.ly|googleusercontent\.com|gstatic\.com$/i.test(
    h,
  );
}

/**
 * Infer a public site hostname from advertiser lookup payloads when `domain`
 * isn't set but URL-ish fields exist (TrendTrack payloads vary widely).
 */
function inferDomainHostnameFromMerged(merged: Record<string, unknown>): string | undefined {
  const BRAND_SITE_KEYS_FIRST = [
    "domain",
    "website_domain",
    "websiteDomain",
    "advertiser_domain",
    "advertiserDomain",
    "page_domain",
    "pageDomain",
    "brand_domain",
    "brandDomain",
    "company_domain",
    "companyDomain",
    "homepage_domain",
    "homepageDomain",
    "canonical_domain",
    "canonicalDomain",
  ];

  for (const k of BRAND_SITE_KEYS_FIRST) {
    const h = hostnameFromFlexibleString(merged[k]);
    if (!h || probablyCdnOrTrackerHost(h)) continue;
    return h;
  }

  const WEB_URL_KEYS = [
    "domain",
    "website_domain",
    "websiteDomain",
    "advertiser_domain",
    "advertiserDomain",
    "page_domain",
    "pageDomain",
    "brand_domain",
    "brandDomain",
    "company_domain",
    "companyDomain",
    "homepage_domain",
    "homepageDomain",
    "canonical_domain",
    "canonicalDomain",
    "hostname",
    "host",
    "website",
    "website_url",
    "websiteUrl",
    "web_site",
    "webSite",
    "advertiser_website",
    "advertiserWebsite",
    "page_website",
    "pageWebsite",
    "external_website",
    "externalWebsite",
    "link",
    "url",
    "href",
    "destination_url",
    "destinationUrl",
    "landing_page_url",
    "landingPageUrl",
    "homepage",
    "homepage_url",
    "homepageUrl",
    "publisher_website",
    "publisherWebsite",
  ];

  let bestFb: string | undefined;
  let bestIg: string | undefined;
  for (const k of WEB_URL_KEYS) {
    const h = hostnameFromFlexibleString(merged[k]);
    if (!h || probablyCdnOrTrackerHost(h)) continue;
    if (/^(facebook\.com|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com|instagram\.com|tiktok\.com)$/.test(h)) {
      bestIg = bestIg ?? h;
    } else bestFb = h;
    if (bestFb) break;
  }
  if (bestFb) return bestFb;
  if (bestIg) return bestIg;

  const urlHint = /(?:domain|website|homepage|landing|canonical|permalink|advertiser_site|publisher|online|official|(?:^|_)url(?:$|_))|(^url$)|(link)|(href)|(site)/i;
  let bestFallback: string | undefined;
  let bestFallLen = Infinity;
  let bestSocialFallback: string | undefined;
  const flat = mergeLookupShards(merged);
  for (const candidate of [{ ...flat }, merged]) {
    for (const [k, val] of Object.entries(candidate)) {
      if (!urlHint.test(k)) continue;
      const h = hostnameFromFlexibleString(val);
      if (!h || probablyCdnOrTrackerHost(h)) continue;
      if (/facebook\.com|instagram\.com|tiktok\.com$/i.test(h)) {
        bestSocialFallback ??= h;
      } else if (h.length <= bestFallLen) {
        bestFallback = h;
        bestFallLen = h.length;
      }
    }
  }
  if (bestFallback) return bestFallback;
  if (bestSocialFallback) return bestSocialFallback;

  /**
   * Last resort: crawl nested string primitives (restricted depth/size) — only when the payload
   * truly hides the ecommerce hostname under an unexpected key label.
   */
  const scraped = scrapeHostnameStrings(merged);
  const nonSocial = scraped.filter((h) => !probablyCdnOrTrackerHost(h) && !/facebook\.com|instagram\.com|tiktok\.com$/i.test(h));
  if (nonSocial.length) return nonSocial.sort((a, b) => a.length - b.length)[0];
  const social = scraped.filter((h) => !probablyCdnOrTrackerHost(h));
  return social.sort((a, b) => a.length - b.length)[0];
}

const MAX_SCRAPE_CHARS = 400;
const MAX_DEPTH = 6;

function scrapeHostnameStrings(node: unknown, depth = 0, out = new Set<string>()): string[] {
  if (depth > MAX_DEPTH || node === null || node === undefined) return [...out];

  if (typeof node === "string") {
    const t = node.trim();
    if (t && t.length <= MAX_SCRAPE_CHARS) {
      const h = hostnameFromFlexibleString(t);
      if (h) out.add(h);
    }
    return [...out];
  }

  if (Array.isArray(node)) {
    for (const el of node) scrapeHostnameStrings(el, depth + 1, out);
    return [...out];
  }

  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const v of Object.values(o)) scrapeHostnameStrings(v, depth + 1, out);
  }
  return [...out];
}

/**
 * Normalize a single `/v1/lookup` row — TrendTrack may use snake_case, nested objects,
 * or advertiser-oriented field names depending on workspace / API version.
 */
export function normalizeTTLookupRow(raw: unknown): TTLookupResult | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mergedFlat = mergeLookupShards(o);

  /** Prefer stable advertiser/page IDs returned by TrendTrack advertiser lookup. */
  const id =
    str(
      mergedFlat.advertiser_id,
      mergedFlat.advertiserId,
      mergedFlat.page_id,
      mergedFlat.pageId,
      mergedFlat.meta_page_id,
      mergedFlat.metaPageId,
      mergedFlat.id,
      o.advertiser_id,
      o.advertiserId,
      o.page_id,
      o.id,
    ) ?? "";
  if (!id) return null;

  const domain =
    coerceDomainHostname(
      str(
        mergedFlat.domain,
        mergedFlat.website_domain,
        mergedFlat.websiteDomain,
        mergedFlat.hostname,
        mergedFlat.host,
      ),
    ) ?? inferDomainHostnameFromMerged(mergedFlat);

  const name =
    str(
      mergedFlat.name,
      mergedFlat.display_name,
      mergedFlat.displayName,
      mergedFlat.page_name,
      mergedFlat.pageName,
      mergedFlat.advertiser_name,
      mergedFlat.advertiserName,
      mergedFlat.brand_name,
      mergedFlat.brandName,
      mergedFlat.title,
      mergedFlat.label,
      mergedFlat.company_name,
      mergedFlat.companyName,
      o.name,
      o.page_name,
    ) ??
    domain ??
    `Advertiser ${id.slice(-8)}`;

  const typeRaw = str(mergedFlat.type, mergedFlat.kind, mergedFlat.entity_type, mergedFlat.entityType, o.type) ?? "advertiser";

  const logo =
    str(
      mergedFlat.logo,
      mergedFlat.logo_url,
      mergedFlat.logoUrl,
      mergedFlat.picture,
      mergedFlat.profile_picture_url,
      mergedFlat.profilePictureUrl,
      mergedFlat.profile_pic,
      mergedFlat.profilePic,
      mergedFlat.image_url,
      mergedFlat.imageUrl,
      o.logo,
      o.logo_url,
    ) ?? undefined;
  const logoUrl = logo;
  const advertising = mergedFlat.advertising && typeof mergedFlat.advertising === "object"
    ? (mergedFlat.advertising as Record<string, unknown>)
    : {};
  const activeAds = num(
    mergedFlat.activeAds,
    mergedFlat.active_ads,
    advertising.activeAds,
    advertising.active_ads,
  );
  const reach30d = num(
    mergedFlat.reach30d,
    mergedFlat.reach_30d,
    advertising.reach30d,
    advertising.reach_30d,
  );

  return {
    id,
    name,
    type: typeRaw,
    ...(domain ? { domain } : {}),
    ...(logo ? { logo } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(activeAds !== undefined ? { activeAds } : {}),
    ...(reach30d !== undefined ? { reach30d } : {}),
  };
}
