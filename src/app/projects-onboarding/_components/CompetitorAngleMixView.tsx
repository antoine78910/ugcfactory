"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Flag,
  Loader2,
  RefreshCw,
  Video,
  Zap,
} from "lucide-react";

import type { AngleMixRow, ClassifiedCompetitorAd } from "@/lib/marketAngleMix";
type AngleMixApiResponse = {
  error?: string;
  competitor: { index: number; name: string; domain: string | null };
  yourBrand: string;
  lastFetched: string;
  nextFetch: string;
  totalAds: number;
  mix: AngleMixRow[];
  topAds: ClassifiedCompetitorAd[];
  totalReach: number;
  insights: {
    whatToTest: string[];
    formatMix: { videos: number; images: number; summary: string };
  };
  fromCache?: { ads: boolean; classified: boolean };
  trendTrackCalled?: boolean;
};

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString("en-US")}K`;
  return String(n);
}

function DonutChart({ rows, totalAds }: { rows: AngleMixRow[]; totalAds: number }) {
  const slices = rows.filter((r) => r.reachShare > 0).slice(0, 4);
  const gradient = useMemo(() => {
    if (slices.length === 0) return "conic-gradient(#333 0deg 360deg)";
    let acc = 0;
    const parts: string[] = [];
    for (const s of slices) {
      const start = acc;
      acc += s.reachShare;
      parts.push(`${s.color} ${start}% ${acc}%`);
    }
    if (acc < 100) parts.push(`#1f1f23 ${acc}% 100%`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [slices]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative size-36 rounded-full"
        style={{ background: gradient }}
        role="img"
        aria-label="Angle mix chart"
      >
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-[#0e0e10] text-center">
          <span className="text-2xl font-semibold tabular-nums text-white">{totalAds}</span>
          <span className="text-[10px] text-white/40">ads active</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.angle} className="flex items-center gap-2 text-white/70">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-white/45">{s.reachShare}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MixTableRow({ row, rank }: { row: AngleMixRow; rank: number }) {
  const barWidth = row.reachShare > 0 ? row.reachShare : 0;
  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-3 pr-3 align-middle">
        <div className="flex items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
          <span className="text-sm text-white/90">{row.label}</span>
        </div>
      </td>
      <td className="hidden w-[28%] py-3 sm:table-cell">
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(barWidth, row.reachShare > 0 ? 4 : 0)}%`, background: row.color }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/45">
            {row.reachShare > 0 ? `${row.reachShare}%` : "—"}
          </span>
        </div>
      </td>
      <td className="py-3 pr-3 text-right text-xs tabular-nums text-white/50 sm:text-left">
        {row.adCount > 0 ? row.adCount : "—"}
      </td>
      <td className="py-3 text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {row.isGap ? (
            <span className="rounded-md bg-orange-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              gap
            </span>
          ) : null}
          {row.isOwned ? (
            <span className="rounded-md border border-sky-400/50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
              only you
            </span>
          ) : null}
          {rank === 1 && row.reachShare >= 20 && !row.isGap && !row.isOwned ? (
            <span className="rounded-md bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              hot
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function CompetitorAngleMixView({
  projectId,
  competitorIndex,
  competitorName,
  onBack,
}: {
  projectId: string;
  competitorIndex: number;
  competitorName: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<AngleMixApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const q = force ? "?force=true" : "";
        const res = await fetch(
          `/api/onboarding/brand/projects/${encodeURIComponent(projectId)}/competitors/${competitorIndex}/angle-mix${q}`,
          { credentials: "include", cache: "no-store" },
        );
        const json = (await res.json().catch(() => ({}))) as AngleMixApiResponse;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load angle mix.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [competitorIndex, projectId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const displayRows = useMemo(() => {
    if (!data) return [];
    return data.mix.filter((r) => r.reachShare > 0 || r.isOwned || r.adCount > 0).slice(0, 12);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06] disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh data
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Market angle mix</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Reach-weighted angles from competitor ads · 7-day cache
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data ? (
              <>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                  {data.totalAds} ads live · {data.competitor.name}
                </span>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/50">
                  Gap analysis vs {data.yourBrand}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {loading && !data ? (
          <div className="flex min-h-[320px] items-center justify-center text-white/50">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-sm text-red-400">{error}</div>
        ) : data ? (
          <div className="grid gap-0 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
            <div className="min-w-0 border-b border-white/[0.06] p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                      <th className="pb-2">Angle</th>
                      <th className="hidden pb-2 sm:table-cell">Reach share</th>
                      <th className="pb-2">Ads</th>
                      <th className="pb-2 text-right">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, i) => (
                      <MixTableRow key={row.angle} row={row} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
              {data.fromCache?.ads || data.fromCache?.classified ? (
                <p className="mt-4 text-[11px] text-white/30">
                  Served from cache
                  {data.trendTrackCalled ? " · TrendTrack refreshed" : " · no new TrendTrack credits used"}
                </p>
              ) : null}
            </div>

            <aside className="flex flex-col gap-5 bg-[#0e0e10] p-5 sm:p-6">
              <DonutChart rows={data.mix} totalAds={data.totalAds} />

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  What to test first
                </p>
                <ul className="mt-3 space-y-3">
                  {data.insights.whatToTest.map((text, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-snug text-white/72">
                      {i === data.insights.whatToTest.length - 1 && text.includes("differentiator") ? (
                        <Flag className="mt-0.5 size-4 shrink-0 text-sky-400/90" />
                      ) : (
                        <Zap className="mt-0.5 size-4 shrink-0 text-amber-400/90" />
                      )}
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Format mix · competitor
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-white/65">
                  <Video className="mt-0.5 size-4 shrink-0 text-white/40" />
                  {data.insights.formatMix.summary}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Top competitor ads
                </p>
                <ul className="mt-3 space-y-2">
                  {data.topAds.slice(0, 3).map((ad) => {
                    const row = data.mix.find((m) => m.angle === ad.angle);
                    return (
                      <li
                        key={ad.id}
                        className="rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                          {ad.reach > 0 ? (
                            <span className="font-semibold text-white/70">{formatReach(ad.reach)}</span>
                          ) : null}
                          <span>{ad.format}</span>
                          {ad.daysRunning ? <span>{ad.daysRunning}d</span> : null}
                          {row ? (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px]"
                              style={{ background: `${row.color}22`, color: row.color }}
                            >
                              {row.label.split(" ")[0]}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-white/85">
                          {ad.headline || ad.copy}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

