"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildBrandProjectInsights,
  normalizeAiAngles,
  type BrandProjectInsights,
} from "@/lib/brandProjectInsights";
import type { BrandMarketingAngle } from "@/lib/onboardingBrandClaude";
import { studioAppPath } from "@/lib/studioAppOrigin";
import { toast } from "sonner";

import { InsightsAngleChart } from "./InsightsAngleChart";

export type BrandProjectRow = {
  id: string;
  title: string;
  site_url: string;
  site_name: string | null;
  site_analysis: Record<string, unknown>;
  marketing_angles: BrandMarketingAngle[];
  competitors: unknown[];
};

function createAdsHref(angle: BrandMarketingAngle, projectTitle: string): string {
  const brief = [angle.label, angle.rationale].filter(Boolean).join(" — ");
  const q = new URLSearchParams({
    brief: brief.slice(0, 500),
    project: projectTitle.slice(0, 120),
  });
  return studioAppPath(`/ads-studio?${q.toString()}`);
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

export function BrandProjectDashboard({
  project,
  onProjectUpdated,
}: {
  project: BrandProjectRow;
  onProjectUpdated: () => void;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [aiAngles, setAiAngles] = useState<BrandProjectInsights["marketAngleChart"] | null>(null);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);

  const insights = useMemo(
    () =>
      buildBrandProjectInsights({
        marketingAngles: project.marketing_angles ?? [],
        competitors: project.competitors ?? [],
        aiMarketAngles: aiAngles,
      }),
    [aiAngles, project.competitors, project.marketing_angles],
  );

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
      toast.success(json.message ?? "Competitors refreshed.");
      onProjectUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshLoading(false);
    }
  }, [onProjectUpdated, project.id]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Winning angles" value={insights.winningAngles.length} />
        <StatTile label="Competitors" value={insights.totals.competitorCount} />
        <StatTile label="Ad samples" value={insights.totals.adSamples} />
        <StatTile label="With reach data" value={insights.totals.adsWithReach} />
      </div>

      <Card className="border-white/[0.08] bg-white/[0.02] shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="size-4 text-violet-400" />
              Winning angles
            </CardTitle>
            <CardDescription className="text-white/50">
              Your brand positioning from onboarding — launch creative for each angle.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {insights.winningAngles.length === 0 ? (
            <p className="text-sm text-white/45">No angles saved. Add them in Settings.</p>
          ) : (
            insights.winningAngles.map((angle) => (
              <div
                key={angle.id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{angle.label}</p>
                  {angle.rationale ? (
                    <p className="mt-1 text-sm leading-relaxed text-white/55">{angle.rationale}</p>
                  ) : null}
                  {angle.evidence ? (
                    <p className="mt-2 text-xs text-white/35">{angle.evidence}</p>
                  ) : null}
                </div>
                <Button asChild className="shrink-0 bg-violet-400 text-black hover:bg-violet-300">
                  <Link href={createAdsHref(angle, project.title)}>
                    <Sparkles className="mr-2 size-4" />
                    Create ads
                  </Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.08] bg-white/[0.02] shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="size-4 text-violet-400" />
              Market angle mix
            </CardTitle>
            <CardDescription className="text-white/50">
              Hooks & scripts from competitor ads (stored snapshot). Heuristic match is instant; AI refines
              distribution without new TrendTrack calls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InsightsAngleChart angles={insights.marketAngleChart} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={aiLoading}
                onClick={() => void runAiAngles()}
                className="border-white/15 bg-white/10 text-white hover:bg-white/15"
              >
                {aiLoading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Sparkles className="mr-2 size-3.5" />}
                Refine with AI
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.08] bg-white/[0.02] shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Top hooks in market</CardTitle>
            <CardDescription className="text-white/50">
              Headlines & primary copy from competitor ads, sorted by reach when available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {insights.topHooks.length === 0 ? (
                <p className="text-sm text-white/40">No hooks in snapshot. Refresh competitors below.</p>
              ) : (
                insights.topHooks.map((h, i) => (
                  <div
                    key={`${h.competitorName}-${i}`}
                    className="rounded-lg border border-white/[0.06] bg-black/25 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                      <span className="rounded bg-white/10 px-1.5 py-0.5">{h.competitorName}</span>
                      <span>{h.platform}</span>
                      {h.reach > 0 ? <span>{formatReach(h.reach)} reach</span> : null}
                      {h.matchedAngle ? (
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-200">
                          {h.matchedAngle}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-medium text-white/90">{h.hook}</p>
                    {h.script && h.script !== h.hook ? (
                      <p className="mt-1 line-clamp-2 text-xs text-white/50">{h.script}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/[0.08] bg-white/[0.02] shadow-none">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-4 text-violet-400" />
              Competitors & top ads
            </CardTitle>
            <CardDescription className="text-white/50">
              Per-competitor angle mix and winning hooks from your saved TrendTrack pull.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={refreshLoading}
            onClick={() => void refreshCompetitors()}
            className="border-white/15 bg-white/10 text-white hover:bg-white/15"
          >
            {refreshLoading ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-3.5" />
            )}
            Refresh missing ads
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-white/40">
            TrendTrack credits: refresh only loads competitors with no ads, uses shared cache (up to 7 days),
            max 10 ads per brand. Use single-competitor refresh from Settings if needed.
          </p>
          {insights.competitors.length === 0 ? (
            <p className="text-sm text-white/45">No competitors — add them in Settings or re-run onboarding.</p>
          ) : (
            insights.competitors.map((c) => {
              const open = expandedCompetitor === c.name;
              return (
                <div
                  key={c.name}
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedCompetitor(open ? null : c.name)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
                  >
                    {open ? (
                      <ChevronDown className="mt-0.5 size-4 shrink-0 text-white/45" />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-white/45" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{c.name}</span>
                        {c.domain ? (
                          <span className="text-xs text-white/40">{c.domain}</span>
                        ) : null}
                        {typeof c.activeAds === "number" ? (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                            {c.activeAds} active ads
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-white/55">{c.summary}</p>
                    </div>
                  </button>
                  {open ? (
                    <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">
                      {c.anglesTheyStress.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {c.anglesTheyStress.map((a) => (
                            <span
                              key={a}
                              className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100/90"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-white/40">
                            Angle mix (their ads)
                          </p>
                          <InsightsAngleChart angles={c.angleChart} />
                        </div>
                        <div>
                          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-white/40">
                            Top ads
                          </p>
                          <div className="space-y-2">
                            {c.topAds.map((ad, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5"
                              >
                                <p className="text-sm font-medium text-white/85">{ad.hook || "—"}</p>
                                {ad.script && ad.script !== ad.hook ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-white/45">{ad.script}</p>
                                ) : null}
                                <p className="mt-1 text-[10px] text-white/35">
                                  {ad.platform}
                                  {ad.reach > 0 ? ` · ${formatReach(ad.reach)}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
