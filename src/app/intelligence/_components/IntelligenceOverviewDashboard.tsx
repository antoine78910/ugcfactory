"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TTAd, TTLookupResult, TTTracker } from "@/lib/intelligenceProvider";
import type { IntelligenceCompetitor } from "@/app/api/intelligence/competitors/route";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
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

function normalizeAdsPayload(raw: unknown): TTAd[] {
  if (Array.isArray(raw)) return raw as TTAd[];
  if (raw && typeof raw === "object") {
    const maybeData = (raw as { data?: unknown; ads?: unknown }).data;
    const maybeAds = (raw as { data?: unknown; ads?: unknown }).ads;
    if (Array.isArray(maybeData)) return maybeData as TTAd[];
    if (Array.isArray(maybeAds)) return maybeAds as TTAd[];
  }
  return [];
}

export function IntelligenceOverviewDashboard({ sortBy }: { sortBy: SortBy }) {
  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const [competitors, setCompetitors] = useState<IntelligenceCompetitor[]>([]);
  const [activeTrackerId, setActiveTrackerId] = useState<string | null>(null);
  const [activeCompetitorId, setActiveCompetitorId] = useState<string | null>(null);
  const [ownAds, setOwnAds] = useState<TTAd[]>([]);
  const [competitorAds, setCompetitorAds] = useState<TTAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownAdsLoading, setOwnAdsLoading] = useState(false);
  const [competitorAdsLoading, setCompetitorAdsLoading] = useState(false);

  const activeTracker = useMemo(() => {
    if (activeTrackerId) return trackers.find((t) => t.id === activeTrackerId) ?? null;
    return trackers[0] ?? null;
  }, [activeTrackerId, trackers]);

  const activeCompetitor = useMemo(() => {
    if (activeCompetitorId) return competitors.find((c) => c.id === activeCompetitorId) ?? null;
    return competitors[0] ?? null;
  }, [activeCompetitorId, competitors]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetch("/api/intelligence/trackers").then((r) => r.json().catch(() => [])),
      fetch("/api/intelligence/competitors").then((r) => r.json().catch(() => [])),
    ])
      .then(([t, c]) => {
        if (cancelled) return;
        setTrackers(Array.isArray(t) ? (t as TTTracker[]) : []);
        setCompetitors(Array.isArray(c) ? (c as IntelligenceCompetitor[]) : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchOwnAds = useCallback(async (tracker: TTTracker) => {
    setOwnAdsLoading(true);
    try {
      // Canonical path for own tracker ids (same source as TrackerDetail).
      const res = await fetch(`/api/intelligence/trackers/${encodeURIComponent(tracker.id)}/top-ads`);
      const json = (await res.json().catch(() => [])) as unknown;
      const rows = normalizeAdsPayload(json).filter((a) => Boolean(a.videoUrl?.trim()));
      setOwnAds(rows.slice(0, 10));
    } finally {
      setOwnAdsLoading(false);
    }
  }, []);

  const fetchCompetitorAds = useCallback(async (competitor: IntelligenceCompetitor, currentSortBy: SortBy) => {
    setCompetitorAdsLoading(true);
    try {
      const q = competitor.domain?.trim() || competitor.name.trim() || "";
      if (!q) {
        setCompetitorAds([]);
        return;
      }
      const params = new URLSearchParams({
        q,
        sortBy: currentSortBy,
      });
      if (competitor.lookupId?.trim()) {
        params.set("lookupId", competitor.lookupId.trim());
      }
      const res = await fetch(`/api/intelligence/competitors/top-ads?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as { ads?: TTAd[] } | TTAd[];
      const rows = Array.isArray((json as { ads?: TTAd[] }).ads)
        ? ((json as { ads?: TTAd[] }).ads as TTAd[])
        : Array.isArray(json)
          ? (json as TTAd[])
          : [];
      setCompetitorAds(rows.filter((a) => Boolean(a.videoUrl?.trim())).slice(0, 10));
    } finally {
      setCompetitorAdsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeTracker?.id) {
      setOwnAds([]);
      return;
    }
    void fetchOwnAds(activeTracker);
  }, [activeTracker, fetchOwnAds]);

  useEffect(() => {
    if (!activeCompetitor) {
      setCompetitorAds([]);
      return;
    }
    void fetchCompetitorAds(activeCompetitor, sortBy);
  }, [activeCompetitor, fetchCompetitorAds, sortBy]);

  if (loading) {
    return (
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white/90">Performance Dashboard</h2>
            <p className="mt-1 text-xs text-white/45">
              Winning ads, top hooks, and recreate shortcuts for your brand and competitors.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-white/70">
              {trackers.length} brand{trackers.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-white/70">
              {competitors.length} competitor{competitors.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white/85">Your winning ads</h3>
          {trackers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {trackers.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTrackerId(t.id)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                    (activeTracker?.id ?? trackers[0]?.id) === t.id
                      ? "border-violet-400/50 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {trackers.length === 0 ? (
          <p className="text-sm text-white/45">No brand connected yet. You can still explore competitors below.</p>
        ) : ownAdsLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : ownAds.length === 0 ? (
          <p className="text-sm text-white/45">No winning video ads found for this brand.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ownAds.map((ad, idx) => (
                <AdCard
                  key={ad.id}
                  ad={{ ...ad, rank: idx + 1 }}
                  playVideoOnHover
                  showRecreateShortcut
                  brandName={activeTracker?.name}
                />
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Best hooks</p>
              <HooksTable ads={ownAds} brandSlug={activeTracker?.name?.toLowerCase().replace(/\s+/g, "-")} />
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white/85">Competitors winning ads</h3>
          {competitors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {competitors.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCompetitorId(c.id)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                    (activeCompetitor?.id ?? competitors[0]?.id) === c.id
                      ? "border-violet-400/50 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {competitors.length === 0 ? (
          <p className="text-sm text-white/45">No competitors saved yet. Add some from the Competitors panel.</p>
        ) : competitorAdsLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : competitorAds.length === 0 ? (
          <p className="text-sm text-white/45">No winning video ads found for this competitor.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {competitorAds.map((ad, idx) => (
                <AdCard
                  key={ad.id}
                  ad={{ ...ad, rank: idx + 1 }}
                  playVideoOnHover
                  showRecreateShortcut
                  brandName={activeCompetitor?.name}
                />
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Best hooks</p>
              <HooksTable ads={competitorAds} brandSlug={activeCompetitor?.name?.toLowerCase().replace(/\s+/g, "-")} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

