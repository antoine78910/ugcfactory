import { requireEnv } from "@/lib/env";

const BASE = "https://api.trendtrack.io";

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
    throw new Error(`TrendTrack ${res.status} ${path}: ${body}`);
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
