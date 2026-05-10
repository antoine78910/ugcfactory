"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Check, Layers, Loader2, Users, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TTLookupResult } from "@/lib/intelligenceProvider";
import { TrackerSearch } from "./TrackerSearch";
import { TrackerList, type SelectedTracker } from "./TrackerList";
import { TrackerDetail } from "./TrackerDetail";
import { CompetitorsPanel, type CompetitorPick } from "./CompetitorsPanel";
import { CompetitorDetail } from "./CompetitorDetail";
import { RecreationsPanel } from "./RecreationsPanel";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { IntelligenceOverviewDashboard } from "./IntelligenceOverviewDashboard";

type IntelligencePanel = null | "brands" | "competitors" | "recreations";

export function IntelligenceClient({
  ownTrackerIds,
  initialPanel = null,
  initialCompetitorId = null,
}: {
  ownTrackerIds: string[];
  initialPanel?: IntelligencePanel;
  initialCompetitorId?: string | null;
}) {
  const router = useRouter();
  const [ownTrackerIdsState, setOwnTrackerIdsState] = useState<string[]>(ownTrackerIds);
  const [selected, setSelected] = useState<SelectedTracker | null>(null);
  const [searchResult, setSearchResult] = useState<TTLookupResult | null>(null);
  const [competitorPick, setCompetitorPick] = useState<CompetitorPick | null>(null);
  const [savingDashboardBrand, setSavingDashboardBrand] = useState(false);
  const [dashboardBrandMessage, setDashboardBrandMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<IntelligencePanel>(initialPanel);
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
  const isStandalonePanelRoute = initialPanel !== null;
  const canReturnToDashboard = Boolean(selected || competitorPick);

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

  const hasBrand = useMemo(() => ownTrackerIdsState.length > 0, [ownTrackerIdsState.length]);

  useEffect(() => {
    if (!initialCompetitorId || !hasBrand) return;
    let cancelled = false;
    void fetch("/api/intelligence/competitors", { cache: "no-store" })
      .then((r) => r.json().catch(() => []))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const match = rows.find((row) => row && typeof row === "object" && row.id === initialCompetitorId) as
          | { id: string; name?: string; lookupId?: string; domain?: string; logoUrl?: string | null }
          | undefined;
        if (!match) return;
        setSelected(null);
        setSearchResult(null);
        setCompetitorPick({
          lookup: {
            id: (match.lookupId ?? match.id).trim(),
            name: (match.name ?? "Competitor").trim() || "Competitor",
            type: "advertiser",
            domain: match.domain ?? undefined,
            logoUrl: match.logoUrl ?? undefined,
          },
          isTracked: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [initialCompetitorId, hasBrand]);

  const saveSearchAsDashboardBrand = useCallback(async () => {
    if (!searchResult || savingDashboardBrand) return;
    if (searchResult.type !== "brandtracker") {
      setDashboardBrandMessage("Please pick a brand tracker result to set your dashboard brand.");
      return;
    }
    setSavingDashboardBrand(true);
    setDashboardBrandMessage(null);
    try {
      const res = await fetch("/api/intelligence/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracker_id: searchResult.id,
          name: searchResult.name,
          logo: searchResult.logo ?? searchResult.logoUrl ?? null,
          domain: searchResult.domain ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save your brand.");
      setOwnTrackerIdsState((prev) => (prev.includes(searchResult.id) ? prev : [searchResult.id, ...prev]));
      setSelected({
        id: searchResult.id,
        name: searchResult.name,
        logo: searchResult.logo ?? searchResult.logoUrl,
        sourceType: "tracker",
        domain: searchResult.domain ?? undefined,
      });
      setDashboardBrandMessage("Brand updated for your dashboard.");
    } catch (e) {
      setDashboardBrandMessage(e instanceof Error ? e.message : "Could not save your brand.");
    } finally {
      setSavingDashboardBrand(false);
    }
  }, [savingDashboardBrand, searchResult]);

  return (
    <div className="flex w-full overflow-hidden max-md:h-[calc(100dvh-3.5rem)] md:h-dvh">
      <WelcomeOverlay />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#06070d]">
        <div className="sticky top-0 z-[5] border-b border-white/10 bg-[#06070d]/85 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              {isStandalonePanelRoute ? (
                <a
                  href="/intelligence"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                  title="Return to dashboard"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Return to dashboard
                </a>
              ) : canReturnToDashboard ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setSearchResult(null);
                    setCompetitorPick(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                  title="Return to dashboard"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Return to dashboard
                </button>
              ) : null}
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
              {searchResult ? (
                <button
                  type="button"
                  onClick={() => void saveSearchAsDashboardBrand()}
                  disabled={savingDashboardBrand}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/12 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:opacity-50"
                  title="Set this searched brand as your dashboard brand"
                >
                  {savingDashboardBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Change brand
                </button>
              ) : null}
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
                    onClick={() => router.push("/intelligence/competitors")}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/[0.06]"
                    title="Competitors"
                  >
                    <Users className="h-4 w-4" aria-hidden />
                    Competitors
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/intelligence/recreations")}
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
          {dashboardBrandMessage ? (
            <div className="px-4 pb-2">
              <p className="text-[11px] text-violet-200/85">{dashboardBrandMessage}</p>
            </div>
          ) : null}
        </div>

        {selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIdsState} />
        ) : competitorPick ? (
          <CompetitorDetail
            competitor={competitorPick.lookup}
            sortBy={competitorSortBy}
            isTracked={competitorPick.isTracked}
          />
        ) : isStandalonePanelRoute && panel === "competitors" ? (
          <div className="mx-auto w-full max-w-6xl p-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
              <CompetitorsPanel
                sortBy={competitorSortBy}
                onSortBy={setCompetitorSortBy}
                onPick={handleCompetitorPick}
              />
            </div>
          </div>
        ) : isStandalonePanelRoute && panel === "recreations" ? (
          <div className="mx-auto w-full max-w-6xl p-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
              <RecreationsPanel />
            </div>
          </div>
        ) : (
          <IntelligenceOverviewDashboard
            sortBy={competitorSortBy}
            hasBrand={hasBrand}
            onAddMyBrand={() => setPanel("brands")}
          />
        )}

        {!isStandalonePanelRoute ? (
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
        ) : null}
      </main>
    </div>
  );
}
