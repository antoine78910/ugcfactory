"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { TTOverview } from "@/lib/intelligenceProvider";
import type { SelectedTracker } from "./TrackerList";
import { CreditsChip } from "./CreditsChip";

function formatNum(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export function IntelligenceHero({
  tracker,
  overview,
  isOwnTracker,
  lastRefreshIso,
  domain,
  onRefreshAll,
  refreshing,
  listFallbackMetrics,
}: {
  tracker: SelectedTracker;
  overview: TTOverview | null;
  isOwnTracker: boolean;
  lastRefreshIso: string | null;
  domain?: string;
  onRefreshAll: () => void;
  refreshing: boolean;
  /** Values from sidebar tracker list when overview response omits totals. */
  listFallbackMetrics?: Pick<TTOverview, "activeAds" | "totalTraffic" | "rank">;
}) {
  const initial = tracker.name.charAt(0).toUpperCase();
  const activeAdsMerged = overview?.activeAds ?? listFallbackMetrics?.activeAds ?? tracker.activeAds;
  const trafficMerged = overview?.totalTraffic ?? listFallbackMetrics?.totalTraffic ?? tracker.totalTraffic;
  const rankMerged = overview?.rank ?? listFallbackMetrics?.rank ?? tracker.rank;
  return (
    <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      {tracker.logo ? (
        <img
          src={tracker.logo}
          alt={tracker.name}
          className="h-12 w-12 shrink-0 rounded-xl bg-white/10 object-contain p-1"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-base font-bold text-violet-200">
          {initial}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-white">{tracker.name}</h2>
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isOwnTracker
                ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
                : "border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {isOwnTracker ? "Your tracker" : "Searched brand"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
          {domain && (
            <a
              href={`https://${domain.replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-white/55 hover:text-violet-300"
            >
              {domain}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
          {lastRefreshIso && <span>Last refresh {relativeTime(lastRefreshIso)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isOwnTracker && (
          <div className="hidden items-center gap-5 sm:flex">
            <Stat label="Active ads" value={formatNum(activeAdsMerged)} />
            <Stat label="Traffic" value={formatNum(trafficMerged)} />
            {typeof rankMerged === "number" && <Stat label="Rank" value={`#${rankMerged}`} />}
          </div>
        )}
        <button
          onClick={onRefreshAll}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:border-violet-400/35 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh all
        </button>
        <CreditsChip />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-base font-semibold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
    </div>
  );
}
