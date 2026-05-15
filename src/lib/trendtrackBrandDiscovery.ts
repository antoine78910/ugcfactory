import type { TTLookupResult } from "@/lib/trendtrack";
import { normalizeTTLookupRow } from "@/lib/trendtrackAdvertiserSearch";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Heuristic: single token that looks like a hostname (used for `searchType: domain` vs `brand`). */
export function trendTrackQueryLooksLikeDomain(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(" ")) return false;
  return /[a-z0-9-]+\.[a-z]{2,}$/i.test(t);
}

export function trendTrackStripHostQuery(raw: string): string {
  let t = raw.trim().toLowerCase();
  t = t.replace(/^https?:\/\//i, "");
  t = (t.split("/")[0] ?? t).trim();
  t = t.replace(/^www\./i, "");
  return t.trim();
}

/**
 * Map one row from `POST /v1/advertisers/query` into `TTLookupResult` (Facebook page id + optional metrics).
 */
export function mapAdvertiserQueryRowToLookup(raw: unknown): TTLookupResult | null {
  const o = asRecord(raw);
  const id = String(o.id ?? o.facebookPageId ?? o.facebook_page_id ?? "").trim();
  if (!id) return null;

  const name = String(o.name ?? "").trim() || `Advertiser ${id.slice(-6)}`;
  const logoUrl = str(o.logoUrl, o.logo_url, o.logo);
  const logo = logoUrl;
  const adv = asRecord(o.advertising);
  const activeAds = num(adv.activeAds ?? adv.active_ads);
  const totalAds = num(
    adv.totalAds ??
      adv.total_ads ??
      adv.adsTotal ??
      adv.ads_total ??
      adv.lifetimeAds ??
      adv.lifetime_ads,
  );
  const reach30d = num(adv.reach30d ?? adv.reach_30d);

  return {
    id,
    name,
    type: "advertiser",
    ...(logoUrl ? { logo, logoUrl } : {}),
    ...(activeAds !== undefined ? { activeAds } : {}),
    ...(totalAds !== undefined ? { totalAds } : {}),
    ...(reach30d !== undefined ? { reach30d } : {}),
  };
}

export function mapAdvertiserQueryRowsToLookups(rows: unknown[]): TTLookupResult[] {
  return rows.map((r) => mapAdvertiserQueryRowToLookup(r)).filter((x): x is TTLookupResult => x !== null);
}

/** Cached lookup rows may be full `TTLookupResult` from advertisers/query or raw `/v1/lookup` rows. */
export function normalizeCachedLookupRows(payload: unknown): TTLookupResult[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      if (row && typeof row === "object" && "activeAds" in (row as Record<string, unknown>)) {
        return row as TTLookupResult;
      }
      const o = row as Record<string, unknown>;
      if (o.advertising && typeof o.advertising === "object") {
        return mapAdvertiserQueryRowToLookup(row);
      }
      return normalizeTTLookupRow(row);
    })
    .filter((x): x is TTLookupResult => x !== null && Boolean(x.id));
}
