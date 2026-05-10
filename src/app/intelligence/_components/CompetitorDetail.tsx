"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TTAd, TTLookupResult } from "@/lib/intelligenceProvider";
import { AdModal } from "./AdModal";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
import { filterAdsByMedia, type MediaFilter } from "./mediaFilter";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

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
  isTracked = false,
}: {
  competitor: TTLookupResult;
  sortBy: SortBy;
  isTracked?: boolean;
}) {
  const activeIdRef = useRef(competitor.id);
  useEffect(() => {
    activeIdRef.current = competitor.id;
  }, [competitor.id]);

  const displayQ = useMemo(() => competitor.domain?.trim() || competitor.name?.trim() || competitor.id, [competitor]);

  const [ads, setAds] = useState<TTAd[]>([]);
  const [adsMediaFilter, setAdsMediaFilter] = useState<MediaFilter>("all");
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<string | null>(null);

  const fetchAds = useCallback(
    async (force = false) => {
      setAdsLoading(true);
      setAdsError(null);
      setStaleAt(null);
      try {
        const params = new URLSearchParams({
          q: displayQ,
          sortBy,
        });
        if (isTracked) params.set("lookupId", competitor.id);
        if (force) params.set("force", "true");
        const res = await fetch(`/api/intelligence/competitors/top-ads?${params.toString()}`);
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
        setAds((parsed.data.ads ?? []).slice(0, 10));
        setStaleAt(parsed.staleAt ?? null);
      } catch {
        setAdsError("Network error");
      } finally {
        setAdsLoading(false);
      }
    },
    [competitor.id, displayQ, isTracked, sortBy],
  );

  useEffect(() => {
    void fetchAds(false);
  }, [fetchAds]);

  const [openAd, setOpenAd] = useState<TTAd | null>(null);
  const filteredAds = useMemo(() => filterAdsByMedia(ads, adsMediaFilter), [ads, adsMediaFilter]);

  useEffect(() => {
    // If this competitor has no videos, don't keep the user stuck on an empty Top Ads grid.
    if (adsMediaFilter !== "videos") return;
    if (ads.length === 0) return;
    const videoAds = filterAdsByMedia(ads, "videos");
    if (videoAds.length === 0) setAdsMediaFilter("all");
  }, [ads, adsMediaFilter]);

  const bestScripts = useMemo(() => {
    const rows = ads
      .map((ad) => {
        const hook = (ad.headline ?? ad.title ?? "").trim();
        const script = (ad.body ?? ad.text ?? "").trim();
        const score = (ad.spend ?? 0) * 2 + (ad.reach ?? 0) + (ad.impressions ?? 0) * 0.25;
        return { hook, script, score };
      })
      .filter((r) => r.script.length >= 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = r.script.slice(0, 120).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [ads]);

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchAds(true)}
                className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white/70 transition"
              >
                Refresh
              </button>
              <div className="inline-flex rounded-lg border border-white/10 bg-black/25 p-0.5 text-[10px]">
                {(["videos", "all", "images"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAdsMediaFilter(m)}
                    className={m === adsMediaFilter ? "rounded-md bg-white/15 px-2 py-1 text-white" : "rounded-md px-2 py-1 text-white/55 hover:text-white/85"}
                  >
                    {m === "videos" ? "Videos" : m === "images" ? "Images" : "All"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {adsLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          )}
          {adsError ? <p className="text-xs text-red-400">{adsError}</p> : null}
          {!adsLoading && !adsError && filteredAds.length === 0 ? (
            <p className="text-sm text-white/40">No ads found for this media filter.</p>
          ) : null}
          {!adsLoading && filteredAds.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredAds.map((ad, idx) => (
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

        {!adsLoading && !adsError && ads.length > 0 ? (
          <section className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
              <h3 className="mb-3 text-sm font-semibold text-white/80">Best hooks</h3>
              <HooksTable ads={ads} brandSlug={competitor.name?.toLowerCase().replace(/\s+/g, "-")} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
              <h3 className="mb-3 text-sm font-semibold text-white/80">Best scripts</h3>
              {bestScripts.length === 0 ? (
                <p className="text-sm text-white/40">No script text found on these ads.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {bestScripts.map((s, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      {s.hook ? (
                        <p className="text-xs font-semibold text-white/80">“{s.hook.slice(0, 110)}”</p>
                      ) : null}
                      <p className={cn("mt-1 text-xs leading-relaxed text-white/55", !s.hook && "mt-0")}>
                        {s.script}
                      </p>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(s.script);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-violet-400/35 hover:text-white"
                          title="Copy script"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      {openAd ? <AdModal ad={openAd} brandName={competitor.name} onClose={() => setOpenAd(null)} /> : null}
    </div>
  );
}

