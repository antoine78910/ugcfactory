"use client";

import { useCallback, useState } from "react";
import type { TTLookupResult } from "@/lib/trendtrack";
import { TrackerSearch } from "./TrackerSearch";
import { TrackerList, type SelectedTracker } from "./TrackerList";
import { TrackerDetail } from "./TrackerDetail";

export function IntelligenceClient({ ownTrackerIds }: { ownTrackerIds: string[] }) {
  const [selected, setSelected] = useState<SelectedTracker | null>(null);
  const [searchResult, setSearchResult] = useState<TTLookupResult | null>(null);

  const handleSearchResult = useCallback((result: TTLookupResult | null) => {
    setSearchResult(result);
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
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 p-4">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="h-2 w-2 rounded-full bg-violet-400" />
          <h1 className="text-sm font-semibold text-white/80">Intelligence</h1>
        </div>
        <TrackerSearch onResult={handleSearchResult} />
        <div className="flex flex-col gap-1">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-white/30">
            Trackers
          </p>
          <TrackerList
            selectedId={selected?.id}
            onSelect={setSelected}
            searchResult={searchResult}
          />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIds} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                <div className="h-5 w-5 rounded bg-violet-500/30" />
              </div>
              <p className="text-sm text-white/40">
                Select a tracker or search for a brand
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
