"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";

import {
  buildBrandProjectInsights,
  normalizeAiAngles,
  type BrandProjectInsights,
} from "@/lib/brandProjectInsights";
import type { BrandMarketingAngle } from "@/lib/onboardingBrandClaude";
import { studioAppPath } from "@/lib/studioAppOrigin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type BrandProjectRow = {
  id: string;
  title: string;
  site_url: string;
  site_name: string | null;
  site_analysis: Record<string, unknown>;
  marketing_angles: BrandMarketingAngle[];
  competitors: unknown[];
};

type InsightItem = { kind: "idea" | "warn" | "star"; text: string };

function createAdsHref(angle: BrandMarketingAngle, projectTitle: string): string {
  const brief = [angle.label, angle.rationale].filter(Boolean).join(" — ");
  const q = new URLSearchParams({
    brief: brief.slice(0, 500),
    project: projectTitle.slice(0, 120),
  });
  return studioAppPath(`/ads-studio?${q.toString()}`);
}

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function pctForAngle(label: string, chart: BrandProjectInsights["marketAngleChart"]): number | null {
  const row = chart.find((a) => a.label.toLowerCase() === label.toLowerCase());
  return row && row.pct > 0 ? row.pct : null;
}

function buildInsightItems(insights: BrandProjectInsights, rawCompetitors: unknown[]): InsightItem[] {
  const items: InsightItem[] = [];
  const gaps = new Set<string>();

  for (const raw of rawCompetitors) {
    if (!raw || typeof raw !== "object") continue;
    const claude = (raw as { claude?: { gaps_you_can_attack?: unknown } }).claude;
    if (!claude || typeof claude !== "object") continue;
    const list = (claude as { gaps_you_can_attack?: unknown }).gaps_you_can_attack;
    if (!Array.isArray(list)) continue;
    for (const g of list) {
      if (typeof g === "string" && g.trim()) gaps.add(g.trim());
    }
  }

  for (const g of [...gaps].slice(0, 2)) {
    items.push({ kind: "idea", text: g });
  }

  const noAds = insights.competitors.filter((c) => c.topAds.length === 0);
  if (noAds.length > 0) {
    const names = noAds.map((c) => c.name).slice(0, 2).join(", ");
    items.push({
      kind: "warn",
      text: `${insights.totals.adSamples === 0 ? "0" : noAds.length} competitor${noAds.length > 1 ? "s" : ""} with no ads — refresh ${names} to unlock angle mix.`,
    });
  } else if (insights.totals.adSamples === 0 && insights.competitors.length > 0) {
    items.push({
      kind: "warn",
      text: "No competitor ads collected yet — refresh competitors to unlock angle mix.",
    });
  }

  const topWinning = insights.winningAngles[0];
  if (topWinning?.label) {
    const inMarket = insights.marketAngleChart.some(
      (a) => a.label.toLowerCase() === topWinning.label.toLowerCase() && a.pct >= 8,
    );
    if (!inMarket) {
      items.push({
        kind: "star",
        text: `"${topWinning.label}" is a strong hook — not yet visible in competitor ad mix.`,
      });
    }
  }

  if (items.length === 0 && insights.winningAngles.length > 0) {
    items.push({
      kind: "star",
      text: `${insights.winningAngles.length} winning angle${insights.winningAngles.length > 1 ? "s" : ""} ready — create your first ads to test them.`,
    });
  }

  return items.slice(0, 4);
}

function KpiStrip({
  angles,
  competitors,
  adSamples,
  withReach,
}: {
  angles: number;
  competitors: number;
  adSamples: number;
  withReach: number;
}) {
  const cells = [
    { label: "Angles", value: angles, sub: "identified" },
    { label: "Competitors", value: competitors, sub: "tracked" },
    { label: "Ad samples", value: adSamples, sub: "collected" },
    { label: "With reach data", value: withReach, sub: "—" },
  ];
  return (
    <div className="grid grid-cols-2 divide-x divide-white/[0.08] border-y border-white/[0.08] bg-[#0c0c0e] sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{c.label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">
            {c.value}
          </p>
          <p className="mt-1 text-xs text-white/35">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function InsightIcon({ kind }: { kind: InsightItem["kind"] }) {
  if (kind === "warn") {
    return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400/90" />;
  }
  if (kind === "star") {
    return <Star className="mt-0.5 size-4 shrink-0 text-sky-400/90" />;
  }
  return <Lightbulb className="mt-0.5 size-4 shrink-0 text-sky-400/90" />;
}

function AngleRow({
  index,
  angle,
  pct,
  isHot,
  isNew,
}: {
  index: number;
  angle: BrandMarketingAngle;
  pct: number | null;
  isHot: boolean;
  isNew: boolean;
}) {
  const barPct = pct ?? 0;
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-1 py-4 last:border-b-0 sm:gap-5">
      <span className="w-5 shrink-0 text-sm font-medium tabular-nums text-white/35">{index}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-white/92 sm:text-[15px]">{angle.label || "Untitled angle"}</p>
          {isHot ? (
            <span className="rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              hot
            </span>
          ) : null}
          {isNew ? (
            <span className="rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              new
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(barPct, pct === null ? 4 : 0))}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/45">
            {pct !== null ? `${pct}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BrandProjectDashboard({
  project,
  onProjectUpdated,
  focus = "full",
  onCompetitorClick,
}: {
  project: BrandProjectRow;
  onProjectUpdated: () => void;
  /** When `ads`, only the ad samples strip is shown (Ad samples tab). */
  focus?: "full" | "ads";
  /** Opens Market angle mix for the competitor at this index. */
  onCompetitorClick?: (index: number, name: string) => void;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [aiAngles, setAiAngles] = useState<BrandProjectInsights["marketAngleChart"] | null>(null);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const insights = useMemo(
    () =>
      buildBrandProjectInsights({
        marketingAngles: project.marketing_angles ?? [],
        competitors: project.competitors ?? [],
        aiMarketAngles: aiAngles,
      }),
    [aiAngles, project.competitors, project.marketing_angles],
  );

  const insightItems = useMemo(
    () => buildInsightItems(insights, project.competitors ?? []),
    [insights, project.competitors],
  );

  const sortedAngles = useMemo(() => {
    return [...insights.winningAngles].sort((a, b) => {
      const pa = pctForAngle(a.label, insights.marketAngleChart) ?? -1;
      const pb = pctForAngle(b.label, insights.marketAngleChart) ?? -1;
      return pb - pa;
    });
  }, [insights.marketAngleChart, insights.winningAngles]);

  const hotAngleId = sortedAngles[0]?.id;
  const maxPct = Math.max(...insights.marketAngleChart.map((a) => a.pct), 0);

  const runAiAngles = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(
        `/api/onboarding/brand/projects/${encodeURIComponent(project.id)}/ai-angles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ force: false }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        angles?: unknown;
        cached?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const angles = normalizeAiAngles(json.angles);
      setAiAngles(angles);
      setLastUpdated(new Date());
      toast.success(json.cached ? "AI angles loaded from cache." : "AI angle mix ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
  }, [project.id]);

  const refreshCompetitors = useCallback(async () => {
    setRefreshLoading(true);
    try {
      const res = await fetch(
        `/api/onboarding/brand/projects/${encodeURIComponent(project.id)}/refresh-competitors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ force: false }),
        },
      );
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLastUpdated(new Date());
      toast.success(json.message ?? "Competitors refreshed.");
      onProjectUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshLoading(false);
    }
  }, [onProjectUpdated, project.id]);

  const firstAngle = sortedAngles[0];
  const createFirstAdsHref = firstAngle
    ? createAdsHref(firstAngle, project.title)
    : studioAppPath("/ads-studio");

  const relativeUpdated =
    Date.now() - lastUpdated.getTime() < 60_000
      ? "just now"
      : lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (focus === "ads") {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-white">Ad samples</h2>
        <p className="mt-1 text-sm text-white/45">Headlines and copy from competitor ads in your snapshot.</p>
        {insights.topHooks.length === 0 ? (
          <p className="mt-8 text-sm text-white/45">
            No hooks yet. Add competitors and refresh from the Dashboard.
          </p>
        ) : (
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insights.topHooks.map((h, i) => (
              <div
                key={`${h.competitorName}-${i}`}
                className="rounded-xl border border-white/[0.06] bg-black/30 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                  <span className="rounded bg-white/10 px-1.5 py-0.5">{h.competitorName}</span>
                  {h.reach > 0 ? <span>{formatReach(h.reach)} reach</span> : null}
                  {h.matchedAngle ? (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-200">{h.matchedAngle}</span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm font-medium text-white/88">{h.hook}</p>
                {h.script && h.script !== h.hook ? (
                  <p className="mt-1 line-clamp-3 text-xs text-white/50">{h.script}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <KpiStrip
        angles={insights.winningAngles.length}
        competitors={insights.totals.competitorCount}
        adSamples={insights.totals.adSamples}
        withReach={insights.totals.adsWithReach}
      />

      <div className="grid gap-0 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
        {/* Top angles — main column */}
        <section className="min-w-0 border-b border-white/[0.08] lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-white sm:text-lg">Top angles</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={aiLoading || insights.totals.adSamples === 0}
                onClick={() => void runAiAngles()}
                title={
                  insights.totals.adSamples === 0
                    ? "Refresh competitor ads first"
                    : "Refine angle mix with AI"
                }
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs font-semibold text-white/85 transition hover:border-white/25 hover:bg-white/[0.04] disabled:opacity-40"
              >
                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Generate scripts
                <ExternalLink className="size-3 opacity-50" />
              </button>
            </div>
          </div>

          <div className="px-5 pb-2 sm:px-6">
            {sortedAngles.length === 0 ? (
              <p className="py-10 text-sm text-white/45">No angles saved. Add them in Settings.</p>
            ) : (
              sortedAngles.slice(0, 8).map((angle, i) => {
                const pct = pctForAngle(angle.label, insights.marketAngleChart);
                const chartRow = insights.marketAngleChart.find(
                  (a) => a.label.toLowerCase() === angle.label.toLowerCase(),
                );
                return (
                  <AngleRow
                    key={angle.id}
                    index={i + 1}
                    angle={angle}
                    pct={pct}
                    isHot={angle.id === hotAngleId && (pct ?? 0) >= maxPct && maxPct > 0}
                    isNew={!angle.evidence && (chartRow?.adCount ?? 0) === 0}
                  />
                );
              })
            )}
          </div>

          <p className="px-5 pb-5 text-[11px] text-white/30 sm:px-6">Last updated: {relativeUpdated}</p>
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col bg-[#0e0e10]">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Competitors</p>
            <ul className="mt-3 space-y-3">
              {insights.competitors.length === 0 ? (
                <li className="text-sm text-white/45">No competitors tracked yet.</li>
              ) : (
                insights.competitors.map((c, compIndex) => {
                  const adCount = c.topAds.length;
                  const initial = (c.name.trim()[0] ?? "?").toUpperCase();
                  const clickable = Boolean(onCompetitorClick);
                  return (
                    <li key={c.name}>
                      <button
                        type="button"
                        onClick={() => onCompetitorClick?.(compIndex, c.name)}
                        disabled={!clickable}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg px-1 py-1 text-left transition",
                          clickable && "cursor-pointer hover:bg-white/[0.04]",
                          !clickable && "cursor-default",
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-sm font-bold text-white/80">
                          {initial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white/90">{c.name}</p>
                          <p className="mt-0.5 text-xs text-white/38">
                            {adCount} ad{adCount !== 1 ? "s" : ""}
                            {adCount === 0 ? " · awaiting refresh" : c.domain ? ` · ${c.domain}` : ""}
                          </p>
                          {clickable ? (
                            <p className="mt-1 text-[10px] font-medium text-violet-300/80">
                              View market angle mix →
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {insights.competitors.length > 0 ? (
              <button
                type="button"
                disabled={refreshLoading}
                onClick={() => void refreshCompetitors()}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-violet-300/90 transition hover:text-violet-200 disabled:opacity-50"
              >
                {refreshLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh competitor ads
              </button>
            ) : null}
          </div>

          <div className="flex-1 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Insights</p>
            <ul className="mt-3 space-y-3">
              {insightItems.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-snug text-white/72">
                  <InsightIcon kind={item.kind} />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/[0.06] p-5">
            <Link
              href={createFirstAdsHref}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.1]"
            >
              Create first ads
              <ExternalLink className="size-4 opacity-60" />
            </Link>
          </div>
        </aside>
      </div>

      {/* Ad samples — below on large screens optional strip */}
      {insights.topHooks.length > 0 ? (
        <section className="border-t border-white/[0.08] px-5 py-5 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white/85">Ad samples</h3>
            <span className="text-xs text-white/35">
              {insights.topHooks.length} hook{insights.topHooks.length !== 1 ? "s" : ""} from competitors
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {insights.topHooks.slice(0, 6).map((h, i) => (
              <div
                key={`${h.competitorName}-${i}`}
                className="rounded-xl border border-white/[0.06] bg-black/30 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                  <span className="rounded bg-white/10 px-1.5 py-0.5">{h.competitorName}</span>
                  {h.reach > 0 ? <span>{formatReach(h.reach)} reach</span> : null}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white/88">{h.hook}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
