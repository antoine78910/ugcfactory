"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TTAd, TTLookupResult } from "@/lib/trendtrack";
import { AdModal } from "./AdModal";
import { AdCard } from "./AdCard";

type SortBy =
  | "currentRank"
  | "reach"
  | "reachDelta1d"
  | "reachDelta7d"
  | "reachDelta30d"
  | "rankDelta7d"
  | "rankDelta14d"
  | "rankDelta30d"
  | "longestRunning";

type IntelError =
  | { code: "auth"; message: string }
  | { code: "rate_limit"; message: string; retryAfterSec?: number }
  | { code: "not_found"; message: string }
  | { code: "server"; message: string }
  | { code: "unknown"; message: string };

async function parseIntelResponse<T>(res: Response): Promise<
  | { ok: true; data: T; staleAt?: string }
  | { ok: false; error: IntelError }
> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = (body.code as IntelError["code"]) ?? "unknown";
    return {
      ok: false,
      error: {
        code,
        message: (body.error as string) ?? `HTTP ${res.status}`,
        ...(typeof body.retryAfterSec === "number" ? { retryAfterSec: body.retryAfterSec as number } : {}),
      } as IntelError,
    };
  }
  if (body && typeof body === "object" && "staleAt" in body && "data" in body) {
    return { ok: true, data: body.data as T, staleAt: body.staleAt as string };
  }
  return { ok: true, data: body as unknown as T };
}

function intelErrorMessage(e: IntelError): string {
  switch (e.code) {
    case "auth":
      return "Data provider key invalid. Contact admin.";
    case "rate_limit":
      return e.retryAfterSec ? `Rate-limited. Retry in ${e.retryAfterSec}s.` : "Rate-limited. Try again shortly.";
    case "not_found":
      return "No data for this advertiser.";
    case "server":
      return "Provider momentarily unavailable.";
    default:
      return e.message || "Network error";
  }
}

export function CompetitorDetail({
  competitor,
  sortBy,
}: {
  competitor: TTLookupResult;
  sortBy: SortBy;
}) {
  const activeIdRef = useRef(competitor.id);
  useEffect(() => {
    activeIdRef.current = competitor.id;
  }, [competitor.id]);

  const displayQ = useMemo(() => competitor.domain?.trim() || competitor.name?.trim() || competitor.id, [competitor]);

  const [ads, setAds] = useState<TTAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);

  const fetchAds = useCallback(
    async (force = false) => {
      setAdsLoading(true);
      setAdsError(null);
      setStaleAt(null);
      try {
        const res = await fetch(
          `/api/intelligence/competitors/top-ads?lookupId=${encodeURIComponent(
            competitor.id,
          )}&q=${encodeURIComponent(displayQ)}&sortBy=${encodeURIComponent(sortBy)}${force ? "&force=true" : ""}`,
        );
        const parsed = await parseIntelResponse<{
          ads: TTAd[];
          source: "tracker_top_ads" | "advertiser_ads" | "ads_query";
          isTracked: boolean;
          sortBy: string;
        }>(res);
        if (activeIdRef.current !== competitor.id) return;
        if (!parsed.ok) {
          setAdsError(intelErrorMessage(parsed.error));
          return;
        }
        setAds((parsed.data.ads ?? []).filter((a) => Boolean(a.videoUrl && a.videoUrl.trim())));
        setStaleAt(parsed.staleAt ?? null);
      } catch {
        setAdsError("Network error");
      } finally {
        setAdsLoading(false);
      }
    },
    [competitor.id, displayQ, sortBy],
  );

  useEffect(() => {
    void fetchAds(false);
  }, [fetchAds]);

  const [openAd, setOpenAd] = useState<TTAd | null>(null);

  return (
    <div className="min-h-full bg-[#0b0912] p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white/90">{competitor.name}</h2>
            <p className="text-xs text-white/45">
              {competitor.domain ? competitor.domain : "Competitor"} · Sort: {sortBy}
              {staleAt ? ` · Stale cache (${new Date(staleAt).toLocaleString()})` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchAds(true)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.07]"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white/80">Top Ads</h3>
            <button
              type="button"
              onClick={() => void fetchAds(true)}
              className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white/70 transition"
            >
              Refresh
            </button>
          </div>

          {adsLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          )}
          {adsError ? <p className="text-xs text-red-400">{adsError}</p> : null}
          {!adsLoading && !adsError && ads.length === 0 ? (
            <p className="text-sm text-white/40">No ads found.</p>
          ) : null}
          {!adsLoading && ads.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {ads.map((ad, idx) => (
                <AdCard
                  key={ad.id}
                  ad={{ ...ad, rank: idx + 1 }}
                  onView={() => setOpenAd(ad)}
                  playVideoOnHover
                  showRecreateShortcut
                  brandName={competitor.name}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {openAd ? <AdModal ad={openAd} brandName={competitor.name} onClose={() => setOpenAd(null)} /> : null}
    </div>
  );
}

