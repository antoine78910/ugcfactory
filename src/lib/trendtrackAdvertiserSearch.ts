import type { TTLookupResult } from "@/lib/trendtrack";

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
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
 * Normalize a single `/v1/lookup` row — TrendTrack may use snake_case, nested objects,
 * or advertiser-oriented field names depending on workspace / API version.
 */
export function normalizeTTLookupRow(raw: unknown): TTLookupResult | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const m = advertiserShard(o);

  /** Prefer stable advertiser/page IDs returned by TrendTrack advertiser lookup. */
  const id =
    str(
      m.advertiser_id,
      m.advertiserId,
      m.page_id,
      m.pageId,
      m.meta_page_id,
      m.metaPageId,
      m.id,
      o.advertiser_id,
      o.advertiserId,
      o.page_id,
      o.id,
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
