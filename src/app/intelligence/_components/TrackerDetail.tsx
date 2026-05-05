"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TTOverview, TTAd } from "@/lib/trendtrack";
import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";
import type { Opportunity } from "@/app/api/intelligence/trackers/[id]/opportunities/route";
import type { SelectedTracker } from "./TrackerList";
import { IntelligenceHero } from "./IntelligenceHero";
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

// ── Typed error helpers ────────────────────────────────────────────────────

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
        ...(typeof body.retryAfterSec === "number"
          ? { retryAfterSec: body.retryAfterSec as number }
          : {}),
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
      return "TrendTrack key invalid. Contact admin.";
    case "rate_limit":
      return e.retryAfterSec
        ? `Rate-limited. Retry in ${e.retryAfterSec}s.`
        : "Rate-limited. Try again shortly.";
    case "not_found":
      return "No data on TrendTrack for this brand.";
    case "server":
      return "TrendTrack momentarily unavailable.";
    default:
      return e.message || "Network error";
  }
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
        const parsed = await parseIntelResponse<TTOverview>(res);
        if (!parsed.ok) {
          setOverviewError(intelErrorMessage(parsed.error));
          return;
        }
        setOverview(parsed.data);
        setOverviewAt(new Date().toISOString());
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
        const parsed = await parseIntelResponse<TTAd[]>(res);
        if (!parsed.ok) {
          setAdsError(intelErrorMessage(parsed.error));
          return;
        }
        setAds(parsed.data);
        setAdsAt(new Date().toISOString());
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
        const parsed = await parseIntelResponse<Angle[]>(res);
        if (!parsed.ok) {
          setAnglesError(intelErrorMessage(parsed.error));
          return;
        }
        setAngles(parsed.data);
        setAnglesAt(new Date().toISOString());
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
          const parsed = await parseIntelResponse<Opportunity[]>(res);
          if (!parsed.ok) {
            setOppsError(intelErrorMessage(parsed.error));
          } else {
            setOpportunities(parsed.data);
            setOpportunitiesAt(new Date().toISOString());
          }
        }
      } catch {
        setOppsError("Network error");
      } finally {
        setOppsLoading(false);
      }
    },
    [tracker.id, tracker.name, ownTrackerIds]
  );

  // Last successful fetch timestamps
  const [overviewAt, setOverviewAt] = useState<string | null>(null);
  const [adsAt, setAdsAt] = useState<string | null>(null);
  const [anglesAt, setAnglesAt] = useState<string | null>(null);
  const [opportunitiesAt, setOpportunitiesAt] = useState<string | null>(null);

  const lastRefreshIso = useMemo(() => {
    const candidates = [overviewAt, adsAt, anglesAt, opportunitiesAt].filter(
      (v): v is string => Boolean(v)
    );
    if (candidates.length === 0) return null;
    return candidates.sort().slice(-1)[0];
  }, [overviewAt, adsAt, anglesAt, opportunitiesAt]);

  const refreshAll = useCallback(() => {
    fetchOverview(true);
    fetchAds(true);
    fetchAngles(true);
    fetchOpportunities(true);
  }, [fetchOverview, fetchAds, fetchAngles, fetchOpportunities]);

  const anyLoading =
    overviewLoading || adsLoading || anglesLoading || oppsLoading;

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
      <IntelligenceHero
        tracker={tracker}
        overview={overview}
        isOwnTracker={isOwnTracker}
        lastRefreshIso={lastRefreshIso}
        domain={(tracker as SelectedTracker & { domain?: string }).domain}
        onRefreshAll={refreshAll}
        refreshing={anyLoading}
      />

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
