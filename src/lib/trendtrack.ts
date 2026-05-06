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
  /** Creative video URL when TrendTrack exposes `media.mediaUrl` (e.g. Meta video). */
  videoUrl?: string;
  platform?: string;
  reach?: number;
  impressions?: number;
  /** Total spend estimate for this creative (if provider exposes it). */
  spend?: number;
  /** Spend per day estimate (if provider exposes it). */
  spendPerDay?: number;
  /** How many days the ad has been running (if provider exposes it; else computed client-side when possible). */
  daysRunning?: number;
  /** Approx count of duplicates/variations for this creative (if provider exposes it). */
  duplicates?: number;
  startDate?: string;
  firstSeen?: string;
  adUrl?: string;
};

function numOrUndefined(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Maps TrendTrack `GET .../overview` JSON to the small stats shape used in Intelligence UI.
 * The API returns `{ requestId, data: { graph, mediaMix, topAds, ... }, meta }`; active ads live under `data.mediaMix`.
 */
function mapOverviewResponse(raw: unknown): TTOverview {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const payload = Object.keys(data).length > 0 ? data : root;

  const mediaMix = asRecord(payload.mediaMix);
  const activeAds = numOrUndefined(mediaMix.activeAds ?? mediaMix.active_ads);

  const graph = asRecord(payload.graph);
  let totalTraffic: number | undefined;

  const spendSeries = graph.euImpressionsSpend;
  if (Array.isArray(spendSeries) && spendSeries.length > 0) {
    const last = asRecord(spendSeries[spendSeries.length - 1]);
    totalTraffic = numOrUndefined(
      last.reach ?? last.impressions ?? last.euReach ?? last.totalReach ?? last.value ?? last.estimatedReach,
    );
  }

  const liveSeries = graph.liveAds;
  if (totalTraffic === undefined && Array.isArray(liveSeries) && liveSeries.length > 0) {
    const last = asRecord(liveSeries[liveSeries.length - 1]);
    totalTraffic = numOrUndefined(
      last.reach ?? last.impressions ?? last.adsLaunched ?? last.count ?? last.value ?? last.total,
    );
  }

  return {
    ...(activeAds !== undefined ? { activeAds } : {}),
    ...(totalTraffic !== undefined ? { totalTraffic } : {}),
  };
}

/**
 * Brandtracker `GET .../top-ads` returns rows `{ ad, metrics }`. Workspace rows use `{ brandtracker, ad, metrics }`.
 */
function normalizeTopAdsRow(row: unknown): TTAd {
  const r = asRecord(row);
  const innerAd = asRecord(r.ad);
  const dto = Object.keys(innerAd).length > 0 ? innerAd : r;

  const rowMetrics = asRecord(r.metrics);
  const base = normalizeTTAd(dto);
  const reachFromRow =
    rowMetrics.totalReach ??
    rowMetrics.reach ??
    rowMetrics.impressions ??
    rowMetrics.estimatedReach ??
    rowMetrics.estimated_reach;

  const mergedReach = base.reach ?? numOrUndefined(reachFromRow);
  const rankFromMetrics = numOrUndefined(
    rowMetrics.currentRank ?? rowMetrics.current_rank ?? rowMetrics.rank ?? rowMetrics.page_rank,
  );

  return {
    ...base,
    ...(mergedReach !== undefined ? { reach: mergedReach } : {}),
    ...(rankFromMetrics !== undefined ? { rank: rankFromMetrics } : {}),
  };
}

/**
 * TrendTrack sometimes returns snake_case fields (e.g. `thumbnail_url`) depending on the endpoint
 * and internal caching layer. Normalize to the camelCase `TTAd` shape used across the UI.
 */
function normalizeTTAd(raw: unknown): TTAd {
  const o = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const content = asRecord(o.content);
  const media = asRecord(o.media);
  const nestedMetrics = asRecord(o.metrics);

  const id = String(o.id ?? o.ad_id ?? o.adId ?? o.creative_id ?? o.creativeId ?? "").trim();
  const headline = (o.headline ?? o.ad_headline ?? o.adHeadline ?? content.headline ?? content.title) as unknown;
  const title = (o.title ?? o.ad_title ?? o.adTitle ?? content.title ?? content.primaryTitle) as unknown;
  const body = (o.body ??
    o.primary_text ??
    o.primaryText ??
    o.ad_body ??
    o.adBody ??
    content.body ??
    content.primaryText) as unknown;
  const text = (o.text ??
    o.description ??
    o.ad_text ??
    o.adText ??
    content.description ??
    content.secondaryText) as unknown;

  const thumbnailUrl = (o.thumbnailUrl ??
    o.thumbnail_url ??
    o.thumbnail ??
    media.thumbnailUrl ??
    media.thumbnail_url ??
    media.imageUrl ??
    media.image_url ??
    media.previewUrl ??
    media.preview ??
    media.image) as unknown;
  const previewUrl = (o.previewUrl ??
    o.preview_url ??
    o.preview ??
    o.creative_preview_url ??
    o.creativePreviewUrl ??
    media.previewUrl ??
    media.preview_url ??
    media.videoPreviewUrl ??
    media.video_preview_url) as unknown;
  const imageUrl =
    (o.imageUrl ?? o.image_url ?? o.image ?? media.imageUrl ?? media.image_url ?? media.url) as unknown;
  const videoUrl = (o.videoUrl ??
    o.video_url ??
    media.mediaUrl ??
    media.media_url ??
    media.videoUrl ??
    media.video_url ??
    media.sourceUrl ??
    media.source_url) as unknown;

  const platform = (o.platform ?? o.publisher_platform ?? o.publisherPlatform) as unknown;
  const reach = numOrUndefined(
    o.reach ??
      o.estimated_reach ??
      o.estimatedReach ??
      nestedMetrics.totalReach ??
      nestedMetrics.reach ??
      nestedMetrics.impressions,
  );
  const impressions = numOrUndefined(
    o.impressions ?? o.estimated_impressions ?? o.estimatedImpressions ?? nestedMetrics.impressions,
  );

  const spend = numOrUndefined(
    o.spend ??
      o.estimated_spend ??
      o.estimatedSpend ??
      nestedMetrics.spend ??
      nestedMetrics.estimatedSpend ??
      nestedMetrics.estimated_spend ??
      nestedMetrics.totalSpend ??
      nestedMetrics.total_spend,
  );

  const spendPerDay = numOrUndefined(
    o.spendPerDay ??
      o.spend_per_day ??
      nestedMetrics.spendPerDay ??
      nestedMetrics.spend_per_day ??
      nestedMetrics.dailySpend ??
      nestedMetrics.daily_spend,
  );
  const startDate = (o.startDate ??
    o.start_date ??
    o.start ??
    o.start_time ??
    o.startTime ??
    o.createdAt ??
    o.created_at) as unknown;
  const firstSeen = (o.firstSeen ?? o.first_seen ?? o.first_seen_at ?? o.firstSeenAt ?? o.first_seen_at) as unknown;
  const adUrl = (o.adUrl ??
    o.ad_url ??
    o.url ??
    o.share_url ??
    o.shareUrl ??
    content.destinationUrl ??
    content.link_url) as unknown;

  const rankRaw = o.rank;
  const rankFromObject =
    typeof rankRaw === "number"
      ? rankRaw
      : numOrUndefined(
          asRecord(rankRaw).currentRank ?? asRecord(rankRaw).current_rank ?? asRecord(rankRaw).value,
        );
  const rankFromDto =
    rankFromObject ?? numOrUndefined(nestedMetrics.currentRank ?? nestedMetrics.current_rank);

  const duplicates = numOrUndefined(
    o.duplicates ??
      o.duplicateCount ??
      o.duplicate_count ??
      nestedMetrics.duplicates ??
      nestedMetrics.duplicateCount ??
      nestedMetrics.duplicate_count,
  );

  const daysRunning =
    numOrUndefined(
      o.daysRunning ??
        o.days_running ??
        nestedMetrics.daysRunning ??
        nestedMetrics.days_running ??
        nestedMetrics.durationDays ??
        nestedMetrics.duration_days,
    ) ??
    (() => {
      const start = parseIsoDate(firstSeen) ?? parseIsoDate(startDate);
      if (!start) return undefined;
      const ms = Date.now() - start.getTime();
      if (!Number.isFinite(ms) || ms < 0) return undefined;
      return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    })();

  return {
    id: id || "unknown",
    ...(typeof headline === "string" && headline.trim() ? { headline: headline.trim() } : {}),
    ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
    ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
    ...(typeof text === "string" && text.trim() ? { text: text.trim() } : {}),
    ...(typeof thumbnailUrl === "string" && thumbnailUrl.trim() ? { thumbnailUrl: thumbnailUrl.trim() } : {}),
    ...(typeof previewUrl === "string" && previewUrl.trim() ? { previewUrl: previewUrl.trim() } : {}),
    ...(typeof imageUrl === "string" && imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
    ...(typeof videoUrl === "string" && videoUrl.trim() && /^https?:\/\//i.test(videoUrl.trim())
      ? { videoUrl: videoUrl.trim() }
      : {}),
    ...(typeof platform === "string" && platform.trim() ? { platform: platform.trim() } : {}),
    ...(reach !== undefined ? { reach } : {}),
    ...(impressions !== undefined ? { impressions } : {}),
    ...(spend !== undefined ? { spend } : {}),
    ...(spendPerDay !== undefined ? { spendPerDay } : {}),
    ...(daysRunning !== undefined ? { daysRunning } : {}),
    ...(duplicates !== undefined ? { duplicates } : {}),
    ...(typeof startDate === "string" && startDate.trim() ? { startDate: startDate.trim() } : {}),
    ...(typeof firstSeen === "string" && firstSeen.trim() ? { firstSeen: firstSeen.trim() } : {}),
    ...(typeof adUrl === "string" && adUrl.trim() ? { adUrl: adUrl.trim() } : {}),
    ...(rankFromDto !== undefined ? { rank: rankFromDto } : {}),
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
  const raw = await ttFetch<unknown>(`/v1/brandtrackers/${encodeURIComponent(id)}/overview`);
  return mapOverviewResponse(raw);
}

export async function ttGetTopAds(id: string, limit = 10, sortBy = "currentRank"): Promise<TTAd[]> {
  const apiSort = sortBy === "longestRunning" ? "daysRunning" : sortBy;
  const sort = `&sortBy=${encodeURIComponent(apiSort)}`;
  const res = await ttFetch<{ data?: unknown[] }>(
    `/v1/brandtrackers/${encodeURIComponent(id)}/top-ads?limit=${limit}${sort}`,
  );
  return (res.data ?? []).map((row) => normalizeTopAdsRow(row));
}

/**
 * Page-scoped ad list for a resolved advertiser (Facebook page id). Prefer this over blind `ads/query` text search when you already have `/v1/lookup` id.
 */
export async function ttListAdvertiserAds(
  advertiserId: string,
  opts?: { limit?: number; offset?: number; sortBy?: string; order?: "asc" | "desc"; status?: string },
): Promise<TTAd[]> {
  const limit = opts?.limit ?? 25;
  const offset = opts?.offset ?? 0;
  const order = opts?.order ?? "desc";
  const sortKey = opts?.sortBy?.trim() || "reach";
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sortBy: sortKey,
    order,
  });
  const st = opts?.status?.trim();
  if (st) qs.set("status", st);
  const res = await ttFetch<{ data?: unknown[] }>(
    `/v1/advertisers/${encodeURIComponent(advertiserId)}/ads?${qs}`,
  );
  return (res.data ?? []).map((row) => normalizeTTAd(row));
}

export async function ttLookup(q: string, options?: { type?: string }): Promise<TTLookupResult[]> {
  const t = options?.type?.trim();
  const typeParam = t ? `&type=${encodeURIComponent(t)}` : "";
  const res = await ttFetch<{ data?: unknown[] }>(
    `/v1/lookup?q=${encodeURIComponent(q)}${typeParam}`
  );
  const rows = res.data ?? [];
  return rows.map((r) => normalizeTTLookupRow(r)).filter((x): x is TTLookupResult => x !== null);
}

export async function ttQueryAds(body: Record<string, unknown>): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: unknown[] }>("/v1/ads/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (res.data ?? []).map((row) =>
    row !== null && typeof row === "object" && "ad" in (row as object)
      ? normalizeTopAdsRow(row)
      : normalizeTTAd(row),
  );
}

export type TTUsage = {
  remaining?: number;
  used?: number;
  plan?: string;
};

export async function ttGetUsage(): Promise<TTUsage> {
  return ttFetch<TTUsage>("/v1/usage");
}
