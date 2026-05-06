"use client";

import { useCallback, useState } from "react";
import type { TTLookupResult } from "@/lib/trendtrack";
import { TrackerSearch } from "./TrackerSearch";
import { TrackerList, type SelectedTracker } from "./TrackerList";
import { TrackerDetail } from "./TrackerDetail";
import { CompetitorsPanel, type CompetitorPick } from "./CompetitorsPanel";
import { CompetitorDetail } from "./CompetitorDetail";

export function IntelligenceClient({ ownTrackerIds }: { ownTrackerIds: string[] }) {
  const [selected, setSelected] = useState<SelectedTracker | null>(null);
  const [searchResult, setSearchResult] = useState<TTLookupResult | null>(null);
  const [competitorPick, setCompetitorPick] = useState<CompetitorPick | null>(null);
  const [competitorSortBy, setCompetitorSortBy] = useState<
    | "currentRank"
    | "reach"
    | "reachDelta1d"
    | "reachDelta7d"
    | "reachDelta30d"
    | "rankDelta7d"
    | "rankDelta14d"
    | "rankDelta30d"
    | "longestRunning"
  >("currentRank");

  const handleSearchResult = useCallback((result: TTLookupResult | null) => {
    setSearchResult(result);
    setCompetitorPick(null);
    if (result) {
      setSelected({
        id: result.id,
        name: result.name,
        logo: result.logo ?? result.logoUrl,
        sourceType: result.type === "brandtracker" ? "tracker" : "search",
      });
    }
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-0px)]">
      <aside className="sticky top-0 flex h-dvh w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-[#06070d] p-4">
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
            <h1 className="text-sm font-semibold text-white/85">Intelligence</h1>
          </div>
          <span className="rounded-md border border-violet-300/35 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-100">
            Beta
          </span>
        </div>
        <TrackerSearch onResult={handleSearchResult} />
        <div className="flex min-h-0 flex-col gap-1">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
            Trackers
          </p>
          <TrackerList
            selectedId={selected?.id}
            onSelect={setSelected}
            searchResult={searchResult}
          />
        </div>
        <CompetitorsPanel
          sortBy={competitorSortBy}
          onSortBy={setCompetitorSortBy}
          onPick={(p) => {
            setCompetitorPick(p);
            if (p) {
              setSelected(null);
              setSearchResult(null);
            }
          }}
        />
      </aside>

      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIds} />
        ) : competitorPick ? (
          <CompetitorDetail competitor={competitorPick.lookup} sortBy={competitorSortBy} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <div className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.9)]" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-white/80">Pick a tracker or search a brand</p>
          <p className="text-xs text-white/40">
            Search by name or domain to look up any advertiser. Save the ones you want to revisit.
          </p>
        </div>
      </div>
    </div>
  );
}
