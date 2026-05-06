import { requireEnv } from "@/lib/env";
import { normalizeTTLookupRow } from "@/lib/trendtrackAdvertiserSearch";

const BASE = "https://api.trendtrack.io";

export type TrendTrackErrorCode =
  | "auth"
  | "rate_limit"
  | "not_found"
  | "server"
  | "unknown";

export class TrendTrackError extends Error {
  status: number;
  code: TrendTrackErrorCode;
  retryAfterSec?: number;
  raw: string;

  constructor(opts: {
    status: number;
    code: TrendTrackErrorCode;
    retryAfterSec?: number;
    raw: string;
    message: string;
  }) {
    super(opts.message);
    this.name = "TrendTrackError";
    this.status = opts.status;
    this.code = opts.code;
    this.retryAfterSec = opts.retryAfterSec;
    this.raw = opts.raw;
  }
}

function classifyTrendTrackStatus(status: number): TrendTrackErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

async function ttFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = requireEnv("TRENDTRACK_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfterRaw = res.headers.get("retry-after");
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : undefined;
    throw new TrendTrackError({
      status: res.status,
      code: classifyTrendTrackStatus(res.status),
      retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
      raw: body,
      message: `TrendTrack ${res.status} ${path}: ${body || "(no body)"}`,
    });
  }
  return res.json() as Promise<T>;
}

export type TTTracker = {
  id: string;
  name: string;
  domain?: string;
  logo?: string;
  logoUrl?: string;
  favicon?: string;
  activeAds?: number;
  newAdsLastDay?: number;
  newAdsLast7Days?: number;
  totalTraffic?: number;
  rank?: number;
};

export type TTOverview = {
  activeAds?: number;
  totalTraffic?: number;
  rank?: number;
};

export type TTAd = {
  id: string;
  /** Rank in a "top performing" list (1..N). Not provided by TrendTrack; assigned client-side. */
  rank?: number;
  headline?: string;
  title?: string;
  body?: string;
  text?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  imageUrl?: string;
  platform?: string;
  reach?: number;
  impressions?: number;
  startDate?: string;
  firstSeen?: string;
  adUrl?: string;
};

function numOrUndefined(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * TrendTrack sometimes returns snake_case fields (e.g. `thumbnail_url`) depending on the endpoint
 * and internal caching layer. Normalize to the camelCase `TTAd` shape used across the UI.
 */
function normalizeTTAd(raw: unknown): TTAd {
  const o = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const id = String(o.id ?? o.ad_id ?? o.adId ?? o.creative_id ?? o.creativeId ?? "").trim();
  const headline = (o.headline ?? o.ad_headline ?? o.adHeadline) as unknown;
  const title = (o.title ?? o.ad_title ?? o.adTitle) as unknown;
  const body = (o.body ?? o.primary_text ?? o.primaryText ?? o.ad_body ?? o.adBody) as unknown;
  const text = (o.text ?? o.description ?? o.ad_text ?? o.adText) as unknown;

  const thumbnailUrl =
    (o.thumbnailUrl ?? o.thumbnail_url ?? o.thumbnail ?? o.thumb_url ?? o.thumbUrl) as unknown;
  const previewUrl =
    (o.previewUrl ?? o.preview_url ?? o.preview ?? o.creative_preview_url ?? o.creativePreviewUrl) as unknown;
  const imageUrl =
    (o.imageUrl ?? o.image_url ?? o.image ?? o.creative_image_url ?? o.creativeImageUrl) as unknown;

  const platform = (o.platform ?? o.publisher_platform ?? o.publisherPlatform) as unknown;
  const reach = numOrUndefined(o.reach ?? o.estimated_reach ?? o.estimatedReach);
  const impressions = numOrUndefined(o.impressions ?? o.estimated_impressions ?? o.estimatedImpressions);
  const startDate = (o.startDate ?? o.start_date ?? o.start ?? o.start_time ?? o.startTime) as unknown;
  const firstSeen = (o.firstSeen ?? o.first_seen ?? o.first_seen_at ?? o.firstSeenAt) as unknown;
  const adUrl = (o.adUrl ?? o.ad_url ?? o.url ?? o.share_url ?? o.shareUrl) as unknown;

  return {
    id: id || "unknown",
    ...(typeof headline === "string" && headline.trim() ? { headline: headline.trim() } : {}),
    ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
    ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
    ...(typeof text === "string" && text.trim() ? { text: text.trim() } : {}),
    ...(typeof thumbnailUrl === "string" && thumbnailUrl.trim() ? { thumbnailUrl: thumbnailUrl.trim() } : {}),
    ...(typeof previewUrl === "string" && previewUrl.trim() ? { previewUrl: previewUrl.trim() } : {}),
    ...(typeof imageUrl === "string" && imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
    ...(typeof platform === "string" && platform.trim() ? { platform: platform.trim() } : {}),
    ...(reach !== undefined ? { reach } : {}),
    ...(impressions !== undefined ? { impressions } : {}),
    ...(typeof startDate === "string" && startDate.trim() ? { startDate: startDate.trim() } : {}),
    ...(typeof firstSeen === "string" && firstSeen.trim() ? { firstSeen: firstSeen.trim() } : {}),
    ...(typeof adUrl === "string" && adUrl.trim() ? { adUrl: adUrl.trim() } : {}),
  };
}

export type TTLookupResult = {
  id: string;
  name: string;
  type: string;
  domain?: string;
  logo?: string;
  logoUrl?: string;
};

export async function ttListTrackers(): Promise<TTTracker[]> {
  const res = await ttFetch<{ data?: TTTracker[] }>("/v1/brandtrackers");
  return res.data ?? [];
}

export async function ttGetOverview(id: string): Promise<TTOverview> {
  return ttFetch<TTOverview>(`/v1/brandtrackers/${encodeURIComponent(id)}/overview`);
}

export async function ttGetTopAds(id: string, limit = 10, sortBy?: string): Promise<TTAd[]> {
  const sort = sortBy ? `&sortBy=${encodeURIComponent(sortBy)}` : "";
  const res = await ttFetch<{ data?: TTAd[] }>(
    `/v1/brandtrackers/${encodeURIComponent(id)}/top-ads?limit=${limit}${sort}`
  );
  return (res.data ?? []).map((ad) => normalizeTTAd(ad));
}

export async function ttLookup(q: string): Promise<TTLookupResult[]> {
  const res = await ttFetch<{ data?: unknown[] }>(
    `/v1/lookup?q=${encodeURIComponent(q)}`
  );
  const rows = res.data ?? [];
  return rows.map((r) => normalizeTTLookupRow(r)).filter((x): x is TTLookupResult => x !== null);
}

/** Raw rows from `/v1/ads/query` (before `TTAd` normalization) — used to roll up advertiser identities. */
export async function ttAdsQueryRawRows(body: Record<string, unknown>): Promise<unknown[]> {
  const res = await ttFetch<{ data?: unknown[] }>("/v1/ads/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data ?? [];
}

export async function ttQueryAds(body: Record<string, unknown>): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: TTAd[] }>("/v1/ads/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (res.data ?? []).map((ad) => normalizeTTAd(ad));
}

export type TTUsage = {
  remaining?: number;
  used?: number;
  plan?: string;
};

export async function ttGetUsage(): Promise<TTUsage> {
  return ttFetch<TTUsage>("/v1/usage");
}
