"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TTOverview, TTAd } from "@/lib/trendtrack";
import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";
import type { Opportunity } from "@/app/api/intelligence/trackers/[id]/opportunities/route";
import type { SelectedTracker } from "./TrackerList";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
import { AnglesChart } from "./AnglesChart";
import { OpportunitiesPanel } from "./OpportunitiesPanel";

function BlockHeader({
  title,
  onRefresh,
  loading,
}: {
  title: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white/70 transition disabled:opacity-30"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </button>
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

function formatNum(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function TrackerDetail({
  tracker,
  ownTrackerIds,
}: {
  tracker: SelectedTracker;
  ownTrackerIds: string[];
}) {
  const isOwnTracker = tracker.sourceType === "tracker";

  // Block 1 — Overview
  const [overview, setOverview] = useState<TTOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const fetchOverview = useCallback(
    async (force = false) => {
      if (!isOwnTracker) return;
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/overview${force ? "?force=true" : ""}`
        );
        const data = (await res.json()) as TTOverview | { error: string };
        if ("error" in data) setOverviewError(data.error);
        else setOverview(data);
      } catch {
        setOverviewError("Network error");
      } finally {
        setOverviewLoading(false);
      }
    },
    [tracker.id, isOwnTracker]
  );

  // Block 2 — Top Ads
  const [ads, setAds] = useState<TTAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);

  const fetchAds = useCallback(
    async (force = false) => {
      setAdsLoading(true);
      setAdsError(null);
      try {
        const endpoint = isOwnTracker
          ? `/api/intelligence/trackers/${tracker.id}/top-ads${force ? "?force=true" : ""}`
          : `/api/intelligence/ads/query${force ? "?force=true" : ""}`;
        const res = isOwnTracker
          ? await fetch(endpoint)
          : await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ advertiser: tracker.id }),
            });
        const data = (await res.json()) as TTAd[] | { error: string };
        if (!Array.isArray(data)) setAdsError(data.error ?? "Failed");
        else setAds(data);
      } catch {
        setAdsError("Network error");
      } finally {
        setAdsLoading(false);
      }
    },
    [tracker.id, isOwnTracker]
  );

  // Block 3 — Angles
  const [angles, setAngles] = useState<Angle[]>([]);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [anglesError, setAnglesError] = useState<string | null>(null);

  const fetchAngles = useCallback(
    async (force = false) => {
      setAnglesLoading(true);
      setAnglesError(null);
      try {
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/angles${force ? "?force=true" : ""}`
        );
        const data = (await res.json()) as Angle[] | { error: string };
        if (!Array.isArray(data)) setAnglesError(data.error ?? "Failed");
        else setAngles(data);
      } catch {
        setAnglesError("Network error");
      } finally {
        setAnglesLoading(false);
      }
    },
    [tracker.id]
  );

  // Block 5 — Opportunities
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [oppsError, setOppsError] = useState<string | null>(null);
  const [oppsNeedsAngles, setOppsNeedsAngles] = useState(false);
  const [oppsMessage, setOppsMessage] = useState<string | undefined>();

  const fetchOpportunities = useCallback(
    async (force = false) => {
      setOppsLoading(true);
      setOppsError(null);
      setOppsNeedsAngles(false);
      try {
        const ownParam = ownTrackerIds.join(",");
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/opportunities?name=${encodeURIComponent(tracker.name)}&ownIds=${ownParam}${force ? "&force=true" : ""}`
        );
        if (res.status === 202) {
          const body = (await res.json()) as { needsAngles: boolean; message?: string };
          setOppsNeedsAngles(true);
          setOppsMessage(body.message);
        } else {
          const data = (await res.json()) as Opportunity[] | { error: string };
          if (!Array.isArray(data)) setOppsError(data.error ?? "Failed");
          else setOpportunities(data);
        }
      } catch {
        setOppsError("Network error");
      } finally {
        setOppsLoading(false);
      }
    },
    [tracker.id, tracker.name, ownTrackerIds]
  );

  useEffect(() => {
    setOverview(null);
    setAds([]);
    setAngles([]);
    setOpportunities([]);
    setOppsNeedsAngles(false);
    fetchOverview();
    fetchAds();
    fetchAngles();
    fetchOpportunities();
  }, [tracker.id]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        {tracker.logo ? (
          <img
            src={tracker.logo}
            alt={tracker.name}
            className="h-10 w-10 rounded-xl bg-white/10 p-1 object-contain"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-sm font-bold text-violet-300">
            {tracker.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-white">{tracker.name}</h2>
          <p className="text-xs text-white/40">
            {isOwnTracker ? "Your tracker" : "Searched brand"}
          </p>
        </div>
      </div>

      {isOwnTracker && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <BlockHeader title="Overview" onRefresh={() => fetchOverview(true)} loading={overviewLoading} />
          {overviewLoading && <Skeleton rows={1} />}
          {overviewError && <p className="text-xs text-red-400">{overviewError}</p>}
          {!overviewLoading && overview && (
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-white">{formatNum(overview.activeAds)}</p>
                <p className="text-xs text-white/40">Active ads</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNum(overview.totalTraffic)}</p>
                <p className="text-xs text-white/40">Total traffic</p>
              </div>
              {overview.rank && (
                <div>
                  <p className="text-2xl font-bold text-white">#{overview.rank}</p>
                  <p className="text-xs text-white/40">Rank</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader title="Top Ads" onRefresh={() => fetchAds(true)} loading={adsLoading} />
        {adsLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        )}
        {adsError && <p className="text-xs text-red-400">{adsError}</p>}
        {!adsLoading && ads.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}
        {!adsLoading && !adsError && ads.length === 0 && (
          <p className="text-sm text-white/40">No ads found.</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader title="Dominant Angles" onRefresh={() => fetchAngles(true)} loading={anglesLoading} />
        {anglesLoading && <Skeleton rows={5} />}
        {anglesError && <p className="text-xs text-red-400">{anglesError}</p>}
        {!anglesLoading && <AnglesChart angles={angles} />}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader title="Top Hooks" onRefresh={() => fetchAds(true)} loading={adsLoading} />
        {adsLoading && <Skeleton rows={4} />}
        {!adsLoading && <HooksTable ads={ads} />}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader title="5 Opportunities" onRefresh={() => fetchOpportunities(true)} loading={oppsLoading} />
        {oppsLoading && <Skeleton rows={5} />}
        {oppsError && <p className="text-xs text-red-400">{oppsError}</p>}
        {!oppsLoading && (
          <OpportunitiesPanel
            opportunities={opportunities}
            needsAngles={oppsNeedsAngles}
            message={oppsMessage}
          />
        )}
      </section>
    </div>
  );
}
