"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Star, Trash2 } from "lucide-react";
import type { TTLookupResult, TTTracker } from "@/lib/trendtrack";
import { cn } from "@/lib/utils";
import type { IntelligenceCompetitor } from "@/app/api/intelligence/competitors/route";

export type CompetitorPick = {
  lookup: TTLookupResult;
  isTracked: boolean;
};

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

const SORT_CHOICES: Array<{ id: SortBy; label: string }> = [
  { id: "currentRank", label: "Current rank" },
  { id: "reach", label: "Reach" },
  { id: "reachDelta1d", label: "Reach delta (1d)" },
  { id: "reachDelta7d", label: "Reach delta (7d)" },
  { id: "reachDelta30d", label: "Reach delta (30d)" },
  { id: "rankDelta7d", label: "Rank delta (7d)" },
  { id: "rankDelta14d", label: "Rank delta (14d)" },
  { id: "rankDelta30d", label: "Rank delta (30d)" },
  { id: "longestRunning", label: "Longest running" },
];

export function CompetitorsPanel({
  onPick,
  sortBy,
  onSortBy,
}: {
  onPick: (p: CompetitorPick | null) => void;
  sortBy: SortBy;
  onSortBy: (s: SortBy) => void;
}) {
  const [query, setQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<TTLookupResult[]>([]);
  const [selectedLookupId, setSelectedLookupId] = useState<string | null>(null);

  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const trackedIds = useMemo(() => new Set(trackers.map((t) => t.id)), [trackers]);

  const [saved, setSaved] = useState<IntelligenceCompetitor[]>([]);
  const [saving, setSaving] = useState(false);

  const selectedLookup = useMemo(() => {
    if (!selectedLookupId) return null;
    return lookupResults.find((r) => r.id === selectedLookupId) ?? null;
  }, [lookupResults, selectedLookupId]);

  const refreshSaved = useCallback(async () => {
    const res = await fetch("/api/intelligence/competitors");
    const json = (await res.json()) as unknown;
    if (Array.isArray(json)) setSaved(json as IntelligenceCompetitor[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/trackers")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (Array.isArray(json)) setTrackers(json as TTTracker[]);
      })
      .catch(() => {});
    void refreshSaved();
    return () => {
      cancelled = true;
    };
  }, [refreshSaved]);

  const runLookup = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResults([]);
    setSelectedLookupId(null);
    onPick(null);
    try {
      const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as TTLookupResult[] | { error?: string };
      if (!Array.isArray(json)) {
        setLookupError(json.error ?? "Search failed");
        return;
      }
      const limited = json.slice(0, 12);
      setLookupResults(limited);
      if (limited.length === 1) {
        const one = limited[0]!;
        setSelectedLookupId(one.id);
        onPick({ lookup: one, isTracked: trackedIds.has(one.id) });
      }
    } catch {
      setLookupError("Network error");
    } finally {
      setLookupLoading(false);
    }
  }, [onPick, query, trackedIds]);

  const selectLookup = useCallback(
    (r: TTLookupResult) => {
      setSelectedLookupId(r.id);
      onPick({ lookup: r, isTracked: trackedIds.has(r.id) });
    },
    [onPick, trackedIds],
  );

  const saveSelected = useCallback(async () => {
    if (!selectedLookup || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/intelligence/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupId: selectedLookup.id,
          name: selectedLookup.name,
          domain: selectedLookup.domain ?? null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      await refreshSaved();
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [refreshSaved, saving, selectedLookup]);

  const deleteSaved = useCallback(
    async (id: string) => {
      await fetch(`/api/intelligence/competitors/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      await refreshSaved();
    },
    [refreshSaved],
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="px-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">Competitors</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runLookup();
            }}
            placeholder="Paste a competitor domain or brand…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50"
          />
        </div>
        <button
          type="button"
          onClick={() => void runLookup()}
          disabled={!query.trim() || lookupLoading}
          className="flex items-center gap-1.5 rounded-xl bg-violet-400 px-3 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        >
          {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <label className="flex items-center gap-2 text-[11px] text-white/45">
          Sort
          <select
            value={sortBy}
            onChange={(e) => onSortBy(e.target.value as SortBy)}
            className="h-7 rounded-lg border border-white/10 bg-black/30 px-2 text-[11px] text-white/80 outline-none"
          >
            {SORT_CHOICES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void saveSelected()}
          disabled={!selectedLookup || saving}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.07]",
            (!selectedLookup || saving) && "cursor-not-allowed opacity-50",
          )}
          title={!selectedLookup ? "Pick a competitor from the list first." : "Save competitor"}
        >
          <Star className="h-3.5 w-3.5" />
          Save
        </button>
      </div>

      {lookupError ? <p className="px-1 text-xs text-red-400">{lookupError}</p> : null}

      {lookupResults.length > 1 ? (
        <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-1">
          {lookupResults.map((r) => {
            const active = r.id === selectedLookupId;
            const isTracked = trackedIds.has(r.id);
            return (
              <button
                key={`${r.type}:${r.id}`}
                type="button"
                onClick={() => selectLookup(r)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
                  active ? "bg-violet-500/15 text-white" : "text-white/80 hover:bg-white/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="truncate text-[11px] text-white/40">{r.domain ?? r.type}</div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    isTracked
                      ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/55",
                  )}
                >
                  {isTracked ? "Tracked" : "Not tracked"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {saved.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/35">Saved</div>
          <div className="flex flex-col gap-1">
            {saved.slice(0, 12).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <button
                  type="button"
                  onClick={() =>
                    selectLookup({
                      id: c.lookupId ?? c.id,
                      name: c.name,
                      type: c.lookupId ? "brandtracker" : "brand",
                      domain: c.domain ?? undefined,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                  title={c.domain ?? c.name}
                >
                  <div className="truncate text-sm font-medium text-white/85">{c.name}</div>
                  <div className="truncate text-[11px] text-white/40">{c.domain ?? ""}</div>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSaved(c.id)}
                  className="rounded-lg border border-white/10 bg-black/20 p-2 text-white/55 transition hover:bg-white/[0.06] hover:text-white/80"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

