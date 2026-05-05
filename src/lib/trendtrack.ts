import { requireEnv } from "@/lib/env";

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

export async function ttGetTopAds(id: string, limit = 10): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: TTAd[] }>(
    `/v1/brandtrackers/${encodeURIComponent(id)}/top-ads?limit=${limit}`
  );
  return res.data ?? [];
}

export async function ttLookup(q: string): Promise<TTLookupResult[]> {
  const res = await ttFetch<{ data?: TTLookupResult[] }>(
    `/v1/lookup?q=${encodeURIComponent(q)}`
  );
  return res.data ?? [];
}

export async function ttQueryAds(body: Record<string, unknown>): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: TTAd[] }>("/v1/ads/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data ?? [];
}

export type TTUsage = {
  remaining?: number;
  used?: number;
  plan?: string;
};

export async function ttGetUsage(): Promise<TTUsage> {
  return ttFetch<TTUsage>("/v1/usage");
}
