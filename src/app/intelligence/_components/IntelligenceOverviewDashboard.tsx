"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Flame,
  Sparkles,
  TrendingUp,
  Trophy,
  Video,
  Wand2,
  Zap,
} from "lucide-react";
import type { TTAd, TTTracker } from "@/lib/intelligenceProvider";
import type { IntelligenceCompetitor } from "@/app/api/intelligence/competitors/route";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
import { filterAdsByMedia, type MediaFilter } from "./mediaFilter";
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
const SORT_TABS: { value: SortBy; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: "currentRank",
    label: "Top Rank",
    icon: <Trophy className="h-3.5 w-3.5" />,
    description: "Highest-ranked ads right now",
  },
  {
    value: "reach",
    label: "Most Reach",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    description: "Widest audience exposure",
  },
  {
    value: "reachDelta7d",
    label: "Scaling 7d",
    icon: <Zap className="h-3.5 w-3.5" />,
    description: "Ads gaining reach this week",
  },
  {
    value: "longestRunning",
    label: "Evergreen",
    icon: <CalendarClock className="h-3.5 w-3.5" />,
    description: "Proven ads running the longest",
  },
];

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

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function KpiCard({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string;
  value: string | number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">{label}</p>
        {href && linkLabel ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] font-semibold text-violet-300/70 transition hover:text-violet-200"
          >
            {linkLabel}
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white/90">{value}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  badge,
  subtitle,
  open,
  onToggle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/55">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">{title}</span>
            {badge ? (
              <span className="rounded-md border border-violet-300/30 bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="truncate text-[11px] text-white/38">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <ChevronDown
          className={cn("h-4 w-4 text-white/30 transition-transform duration-200", open && "rotate-180")}
        />
      </div>
    </button>
  );
}

function PodiumRow({ ad, idx }: { ad: TTAd; idx: number }) {
  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
  const label = (ad.headline ?? ad.title ?? ad.body ?? ad.text ?? "—").trim();
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 transition",
        idx === 0 && "border-amber-400/20 bg-amber-500/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base",
          !medal && "border border-white/10 bg-white/[0.04] text-[11px] font-bold text-white/50",
        )}
      >
        {medal ?? `#${idx + 1}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white/90">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-white/40">
          {ad.platform ?? "—"}
          {typeof ad.reach === "number" ? ` · ${formatReach(ad.reach)} reach` : ""}
          {typeof ad.daysRunning === "number" ? ` · ${ad.daysRunning}d running` : ""}
        </p>
      </div>
      {ad.adUrl ? (
        <a
          href={ad.adUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.1]"
        >
          <ExternalLink className="h-3 w-3" />
          See the ad
        </a>
      ) : null}
    </div>
  );
}

export function IntelligenceOverviewDashboard({
  sortBy: _sortBy,
  hasBrand = true,
  onAddMyBrand,
}: {
  sortBy: SortBy;
  hasBrand?: boolean;
  onAddMyBrand?: () => void;
}) {
  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const [competitors, setCompetitors] = useState<IntelligenceCompetitor[]>([]);
  const [activeTrackerId, setActiveTrackerId] = useState<string | null>(null);
  const [activeCompetitorId, setActiveCompetitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recreationsCount, setRecreationsCount] = useState(0);

  const [adsCache, setAdsCache] = useState<Partial<Record<SortBy, TTAd[]>>>({});
  const [adsLoading, setAdsLoading] = useState<Partial<Record<SortBy, boolean>>>({});
  const [ownAds, setOwnAds] = useState<TTAd[]>([]);
  const [ownAdsLoading, setOwnAdsLoading] = useState(false);
  const [competitorMediaFilter, setCompetitorMediaFilter] = useState<MediaFilter>("videos");
  const [ownMediaFilter, setOwnMediaFilter] = useState<MediaFilter>("videos");

  const [competitorMode, setCompetitorMode] = useState<SortBy>("currentRank");

  const [sections, setSections] = useState({
    competitorWatch: true,
    creativeInspiration: true,
    yourBrand: true,
  });

  const toggleSection = (key: keyof typeof sections) =>
    setSections((p) => ({ ...p, [key]: !p[key] }));

  const activeTracker = useMemo(
    () => (activeTrackerId ? trackers.find((t) => t.id === activeTrackerId) : trackers[0]) ?? null,
    [activeTrackerId, trackers],
  );
  const activeCompetitor = useMemo(
    () =>
      (activeCompetitorId ? competitors.find((c) => c.id === activeCompetitorId) : competitors[0]) ?? null,
    [activeCompetitorId, competitors],
  );

  const competitorAds = useMemo(() => adsCache[competitorMode] ?? [], [adsCache, competitorMode]);
  const filteredCompetitorAds = useMemo(
    () => filterAdsByMedia(competitorAds, competitorMediaFilter),
    [competitorAds, competitorMediaFilter],
  );
  const filteredOwnAds = useMemo(() => filterAdsByMedia(ownAds, ownMediaFilter), [ownAds, ownMediaFilter]);
  const isLoaded = useMemo(() => competitorMode in adsCache, [adsCache, competitorMode]);
  const isLoadingMode = adsLoading[competitorMode] ?? false;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetch("/api/intelligence/trackers").then((r) => r.json().catch(() => [])),
      fetch("/api/intelligence/competitors").then((r) => r.json().catch(() => [])),
      fetch("/api/intelligence/recreations").then((r) => r.json().catch(() => [])),
    ])
      .then(([t, c, recs]) => {
        if (cancelled) return;
        setTrackers(Array.isArray(t) ? (t as TTTracker[]) : []);
        setCompetitors(Array.isArray(c) ? (c as IntelligenceCompetitor[]) : []);
        setRecreationsCount(Array.isArray(recs) ? recs.length : 0);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fetchAdsForMode = useCallback(async (competitor: IntelligenceCompetitor, mode: SortBy) => {
    setAdsLoading((p) => ({ ...p, [mode]: true }));
    try {
      const q = competitor.domain?.trim() || competitor.name.trim() || "";
      if (!q) return;
      const params = new URLSearchParams({ q, sortBy: mode });
      if (competitor.lookupId?.trim()) params.set("lookupId", competitor.lookupId.trim());
      const res = await fetch(`/api/intelligence/competitors/top-ads?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as { ads?: TTAd[] } | TTAd[];
      const rows = Array.isArray((json as { ads?: TTAd[] }).ads)
        ? ((json as { ads?: TTAd[] }).ads as TTAd[])
        : Array.isArray(json) ? (json as TTAd[]) : [];
      setAdsCache((p) => ({ ...p, [mode]: rows.slice(0, 10) }));
    } finally {
      setAdsLoading((p) => ({ ...p, [mode]: false }));
    }
  }, []);

  const fetchOwnAds = useCallback(async (tracker: TTTracker) => {
    setOwnAdsLoading(true);
    try {
      const res = await fetch(`/api/intelligence/trackers/${encodeURIComponent(tracker.id)}/top-ads`);
      const json = (await res.json().catch(() => [])) as unknown;
      const rows = normalizeAdsPayload(json);
      setOwnAds(rows.slice(0, 10));
    } finally { setOwnAdsLoading(false); }
  }, []);

  // Reset cache on competitor change, then auto-load currentRank + reach (already cached, 0 cost)
  useEffect(() => {
    setAdsCache({});
    setCompetitorMode("currentRank");
  }, [activeCompetitor?.id]);

  useEffect(() => {
    if (!activeCompetitor) { setAdsCache({}); return; }
    void fetchAdsForMode(activeCompetitor, "currentRank");
    void fetchAdsForMode(activeCompetitor, "reach");
    void fetchAdsForMode(activeCompetitor, "reachDelta1d");
    void fetchAdsForMode(activeCompetitor, "reachDelta7d");
    void fetchAdsForMode(activeCompetitor, "reachDelta30d");
    void fetchAdsForMode(activeCompetitor, "rankDelta7d");
    void fetchAdsForMode(activeCompetitor, "rankDelta14d");
    void fetchAdsForMode(activeCompetitor, "rankDelta30d");
    void fetchAdsForMode(activeCompetitor, "longestRunning");
  }, [activeCompetitor, fetchAdsForMode]);

  useEffect(() => {
    if (!activeCompetitor) return;
    if (competitorMode in adsCache) return;
    void fetchAdsForMode(activeCompetitor, competitorMode);
  }, [activeCompetitor, competitorMode, adsCache, fetchAdsForMode]);

  useEffect(() => {
    if (!activeTracker?.id) { setOwnAds([]); return; }
    void fetchOwnAds(activeTracker);
  }, [activeTracker, fetchOwnAds]);

  // Hooks from currentRank ads (free, derived)
  const competitorHooks = useMemo(() => {
    const seen = new Set<string>();
    return (adsCache["currentRank"] ?? [])
      .map((ad) => ({
        text: (ad.headline ?? ad.title ?? "").trim(),
        reach: ad.reach ?? 0,
        platform: ad.platform ?? "",
        adUrl: ad.adUrl,
      }))
      .filter((r) => {
        if (r.text.length < 10) return false;
        const key = r.text.toLowerCase().slice(0, 80);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [adsCache]);

  const topFive = useMemo(() => (adsCache["currentRank"] ?? []).slice(0, 5), [adsCache]);
  const totalAds = ownAds.length + Object.values(adsCache).flat().length;

  if (loading) {
    return (
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      {!hasBrand ? (
        <section className="rounded-2xl border border-violet-300/25 bg-violet-500/[0.08] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-violet-100">No brand connected yet</p>
              <p className="mt-1 text-xs text-violet-100/80">
                Add your brand to unlock your own top ads and personalized insights.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddMyBrand?.()}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-3 py-2 text-xs font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none"
            >
              Add my brand
            </button>
          </div>
        </section>
      ) : null}


      {/* ── KPI row ── */}
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Brands tracked" value={trackers.length} />
        <KpiCard
          label="Competitors"
          value={competitors.length}
          href="/intelligence/competitors"
          linkLabel="Manage"
        />
        <KpiCard label="Ads loaded" value={totalAds} />
        <KpiCard
          label="Recreations"
          value={recreationsCount}
          href="/intelligence/recreations"
          linkLabel="View all"
        />
        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">Cache policy</p>
          <p className="mt-2 text-sm font-semibold text-white/70">7-day TTL · lazy load</p>
        </div>
      </div>

      {/* ── Competitor selector ── */}
      {competitors.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {competitors.slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCompetitorId(c.id)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                (activeCompetitor?.id ?? competitors[0]?.id) === c.id
                  ? "border-violet-400/50 bg-violet-500/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Section: Competitor Watch ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <SectionHeader
          icon={<Flame className="h-3.5 w-3.5" />}
          title="Competitor Watch"
          badge="Live"
          subtitle={activeCompetitor ? `Analysing: ${activeCompetitor.name}` : "Select a competitor above"}
          open={sections.competitorWatch}
          onToggle={() => toggleSection("competitorWatch")}
          action={
            activeCompetitor?.id ? (
              <a
                href={`/competitors/${encodeURIComponent(activeCompetitor.lookupId ?? activeCompetitor.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.08]"
              >
                <ExternalLink className="h-3 w-3" />
                Full view
              </a>
            ) : null
          }
        />

        {sections.competitorWatch ? (
          <div className="mt-4 flex flex-col gap-4">
            {/* Sort tabs */}
            <div className="flex flex-wrap gap-1.5">
              {SORT_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCompetitorMode(tab.value)}
                  title={tab.description}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition",
                    competitorMode === tab.value
                      ? "border-violet-400/50 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]",
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="inline-flex self-start rounded-lg border border-white/10 bg-black/25 p-0.5 text-[10px]">
              {(["videos", "all", "images"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompetitorMediaFilter(m)}
                  className={m === competitorMediaFilter ? "rounded-md bg-white/15 px-2 py-1 text-white" : "rounded-md px-2 py-1 text-white/55 hover:text-white/85"}
                >
                  {m === "videos" ? "Videos" : m === "images" ? "Images" : "All"}
                </button>
              ))}
            </div>

            {competitors.length === 0 ? (
              <p className="text-sm text-white/45">No competitors saved yet. Add some from the Competitors panel.</p>
            ) : isLoadingMode ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : filteredCompetitorAds.length === 0 ? (
              <p className="text-sm text-white/45">No ads found for this media filter.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredCompetitorAds.map((ad, idx) => (
                  <AdCard
                    key={ad.id}
                    ad={{ ...ad, rank: idx + 1 }}
                    playVideoOnHover
                    showRecreateShortcut
                    brandName={activeCompetitor?.name}
                  />
                ))}
              </div>
            )}

            {/* Top 5 Podium */}
            {topFive.length > 0 ? (
              <div className="mt-1">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                  Top 5 podium
                </p>
                <div className="flex flex-col gap-1.5">
                  {topFive.map((ad, idx) => (
                    <PodiumRow key={ad.id} ad={ad} idx={idx} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Section: Creative Inspiration ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <SectionHeader
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Creative Inspiration"
          subtitle="Hooks, angles and best-performing copy from competitor ads"
          open={sections.creativeInspiration}
          onToggle={() => toggleSection("creativeInspiration")}
        />

        {sections.creativeInspiration ? (
          <div className="mt-4 flex flex-col gap-4">
            {/* Hook list */}
            {competitorHooks.length === 0 ? (
              <p className="text-sm text-white/45">Load competitor ads (Top Rank) to see hooks.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                  Best hooks — {activeCompetitor?.name ?? "competitor"}
                </p>
                {competitorHooks.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-relaxed text-white/85">{h.text}</p>
                      <p className="mt-0.5 text-[11px] text-white/38">
                        {h.platform}{h.reach ? ` · ${formatReach(h.reach)} reach` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(h.text);
                        }}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/55 transition hover:bg-white/[0.08]"
                      >
                        Copy
                      </button>
                      {h.adUrl ? (
                        <a
                          href={h.adUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-white/10 bg-white/[0.04] p-1 text-white/40 transition hover:text-white/70"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scaling hooks — lazy */}
            {(() => {
              const scalingAds = adsCache["reachDelta7d"];
              if (!scalingAds) {
                return adsLoading["reachDelta7d"] ? (
                  <p className="text-sm text-white/45">Loading scaling hooks…</p>
                ) : null;
              }
              const scalingHooks = scalingAds
                .map((ad) => (ad.headline ?? ad.title ?? "").trim())
                .filter((t, i, arr) => t.length >= 10 && arr.indexOf(t) === i)
                .slice(0, 5);
              if (scalingHooks.length === 0) return null;
              return (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                    Scaling hooks (reach +7d)
                  </p>
                  <div className="flex flex-col gap-1">
                    {scalingHooks.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.04] px-3.5 py-2"
                      >
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                        <p className="text-xs font-medium text-white/85">{h}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Evergreen hooks — lazy */}
            {(() => {
              const evergreenAds = adsCache["longestRunning"];
              if (!evergreenAds) {
                return adsLoading["longestRunning"] ? (
                  <p className="text-sm text-white/45">Loading evergreen hooks…</p>
                ) : null;
              }
              const evHooks = evergreenAds
                .map((ad) => ({
                  text: (ad.headline ?? ad.title ?? "").trim(),
                  days: ad.daysRunning ?? 0,
                }))
                .filter((r, i, arr) => r.text.length >= 10 && arr.findIndex((x) => x.text === r.text) === i)
                .slice(0, 5);
              if (evHooks.length === 0) return null;
              return (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                    Evergreen hooks (longest running)
                  </p>
                  <div className="flex flex-col gap-1">
                    {evHooks.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-xl border border-amber-400/15 bg-amber-500/[0.04] px-3.5 py-2"
                      >
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                        <p className="flex-1 text-xs font-medium text-white/85">{h.text}</p>
                        {h.days > 0 ? (
                          <span className="shrink-0 text-[11px] text-white/35">{h.days}d</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </section>

      {/* ── Section: Your Brand ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <SectionHeader
          icon={<Video className="h-3.5 w-3.5" />}
          title="Your Brand"
          subtitle={activeTracker ? `Top ads for ${activeTracker.name}` : "No brand connected yet"}
          open={sections.yourBrand}
          onToggle={() => toggleSection("yourBrand")}
          action={
            trackers.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {trackers.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveTrackerId(t.id); }}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-[11px] font-semibold transition",
                      (activeTracker?.id ?? trackers[0]?.id) === t.id
                        ? "border-violet-400/40 bg-violet-500/15 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            ) : null
          }
        />

        {sections.yourBrand ? (
          <div className="mt-4 flex flex-col gap-4">
            {trackers.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-white/45">No brand connected yet.</p>
                <button
                  type="button"
                  onClick={() => onAddMyBrand?.()}
                  className="rounded-lg border border-violet-300/35 bg-violet-500/12 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/20"
                >
                  Add my brand
                </button>
              </div>
            ) : ownAdsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : (
              <>
                <div className="inline-flex self-start rounded-lg border border-white/10 bg-black/25 p-0.5 text-[10px]">
                  {(["videos", "all", "images"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOwnMediaFilter(m)}
                      className={m === ownMediaFilter ? "rounded-md bg-white/15 px-2 py-1 text-white" : "rounded-md px-2 py-1 text-white/55 hover:text-white/85"}
                    >
                      {m === "videos" ? "Videos" : m === "images" ? "Images" : "All"}
                    </button>
                  ))}
                </div>
                {filteredOwnAds.length === 0 ? (
                  <p className="text-sm text-white/45">No ads found for this media filter.</p>
                ) : null}
                {filteredOwnAds.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {filteredOwnAds.map((ad, idx) => (
                        <AdCard
                          key={ad.id}
                          ad={{ ...ad, rank: idx + 1 }}
                          playVideoOnHover
                          showRecreateShortcut
                          brandName={activeTracker?.name}
                        />
                      ))}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                        Best hooks
                      </p>
                      <HooksTable ads={filteredOwnAds} brandSlug={activeTracker?.name?.toLowerCase().replace(/\s+/g, "-")} />
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </section>

      {/* ── Section: Recreations ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/55">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white/90">Recreations</p>
              <p className="text-[11px] text-white/38">{recreationsCount} saved recreation{recreationsCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <a
            href="/intelligence/recreations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08]"
          >
            <ExternalLink className="h-3 w-3" />
            View all
          </a>
        </div>
      </section>

    </div>
  );
}
