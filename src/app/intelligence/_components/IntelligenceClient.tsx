"use client";

import { useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Layers, Users, Wand2, X } from "lucide-react";
import type { TTLookupResult } from "@/lib/trendtrack";
import { TrackerSearch } from "./TrackerSearch";
import { TrackerList, type SelectedTracker } from "./TrackerList";
import { TrackerDetail } from "./TrackerDetail";
import { CompetitorsPanel, type CompetitorPick } from "./CompetitorsPanel";
import { CompetitorDetail } from "./CompetitorDetail";
import { RecreationsPanel } from "./RecreationsPanel";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { IntelligenceOnboarding } from "./IntelligenceOnboarding";

export function IntelligenceClient({ ownTrackerIds }: { ownTrackerIds: string[] }) {
  const [selected, setSelected] = useState<SelectedTracker | null>(null);
  const [searchResult, setSearchResult] = useState<TTLookupResult | null>(null);
  const [competitorPick, setCompetitorPick] = useState<CompetitorPick | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [panel, setPanel] = useState<null | "brands" | "competitors" | "recreations">(null);
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

  const handleCompetitorPick = useCallback((p: CompetitorPick | null) => {
    setCompetitorPick(p);
    if (p) {
      setSelected(null);
      setSearchResult(null);
    }
  }, []);

  const hasBrand = useMemo(() => ownTrackerIds.length > 0 || onboardingDone, [ownTrackerIds.length, onboardingDone]);

  return (
    <div className="flex w-full overflow-hidden max-md:h-[calc(100dvh-3.5rem)] md:h-dvh">
      <WelcomeOverlay />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#06070d]">
        <div className="sticky top-0 z-[5] border-b border-white/10 bg-[#06070d]/85 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
              <h1 className="text-sm font-semibold text-white/85">Intelligence</h1>
              <span className="ml-1 rounded-md border border-violet-300/35 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-100">
                Beta
              </span>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="w-full max-w-[540px] max-md:max-w-none">
                <TrackerSearch onResult={handleSearchResult} />
              </div>
              <button
                type="button"
                onClick={() => setPanel("brands")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                title="Your brands"
              >
                <Layers className="h-4 w-4" aria-hidden />
                Brands
              </button>
              {hasBrand ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPanel("competitors")}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                    title="Competitors"
                  >
                    <Users className="h-4 w-4" aria-hidden />
                    Competitors
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel("recreations")}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                    title="Recreations"
                  >
                    <Wand2 className="h-4 w-4" aria-hidden />
                    Recreations
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {!hasBrand ? (
          <IntelligenceOnboarding
            onDone={() => {
              setOnboardingDone(true);
            }}
          />
        ) : selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIds} />
        ) : competitorPick ? (
          <CompetitorDetail competitor={competitorPick.lookup} sortBy={competitorSortBy} />
        ) : (
          <EmptyState />
        )}

        <Dialog.Root open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[min(92vh,820px)] w-[min(1040px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0912] shadow-2xl outline-none">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-sm font-semibold text-white/90">
                    {panel === "brands"
                      ? "Your brands"
                      : panel === "competitors"
                        ? "Competitors"
                        : panel === "recreations"
                          ? "Recreations"
                          : "Panel"}
                  </Dialog.Title>
                  <Dialog.Description className="truncate text-[11px] text-white/45">
                    {panel === "brands"
                      ? "Pick a tracker, search a brand, or pin advertisers."
                      : panel === "competitors"
                        ? "Save up to 3 competitors and browse their top ads."
                        : panel === "recreations"
                          ? "Your saved ad recreations."
                          : ""}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </Dialog.Close>
              </div>
              <div className="max-h-[min(82vh,760px)] overflow-y-auto p-4">
                {panel === "brands" ? (
                  <div className="flex flex-col gap-3">
                    <TrackerList selectedId={selected?.id} onSelect={setSelected} searchResult={searchResult} />
                  </div>
                ) : panel === "competitors" ? (
                  <CompetitorsPanel
                    sortBy={competitorSortBy}
                    onSortBy={setCompetitorSortBy}
                    onPick={(p) => {
                      handleCompetitorPick(p);
                      if (p) setPanel(null);
                    }}
                  />
                ) : panel === "recreations" ? (
                  <RecreationsPanel />
                ) : null}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
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
