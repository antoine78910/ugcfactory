"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Star, Trash2 } from "lucide-react";
import type { TTLookupResult, TTTracker } from "@/lib/intelligenceProvider";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { cn } from "@/lib/utils";
import type { IntelligenceCompetitor } from "@/app/api/intelligence/competitors/route";

const LOOKUP_DEBOUNCE_MS = 320;

export type CompetitorPick = {
  lookup: TTLookupResult;
  isTracked: boolean;
};

/**
 * Prefer provider avatar when present, else Clearbit logo from domain, then Google favicon —
 * all free; no extra provider calls.
 */
function CompetitorDomainAvatar({
  domain,
  logoUrl,
  name,
}: {
  domain: string | undefined;
  logoUrl: string | undefined;
  name: string;
}) {
  const d = domain?.trim().replace(/^www\./i, "").toLowerCase() ?? "";
  const letter = (name || "?").charAt(0).toUpperCase();
  const hasDomain = Boolean(d && d.includes("."));
  const remoteLogo = (logoUrl ?? "").trim();
  const proxiedLogo = remoteLogo ? proxiedMediaSrc(remoteLogo) || remoteLogo : "";
  const clearbit = hasDomain ? `https://logo.clearbit.com/${encodeURIComponent(d)}` : "";
  const googleFb = hasDomain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64` : "";

  const imgClass =
    "relative z-[1] h-9 w-9 rounded-[6px] object-contain p-0.5";

  const chainImageError = (e: { currentTarget: HTMLImageElement }) => {
    const el = e.currentTarget;
    const step = el.dataset.step ?? "api";
    if (step === "api" && clearbit) {
      el.dataset.step = "clearbit";
      el.src = clearbit;
      el.className = imgClass;
      return;
    }
    if (step === "clearbit" && googleFb) {
      el.dataset.step = "google";
      el.src = googleFb;
      return;
    }
    el.onerror = null;
    el.style.visibility = "hidden";
  };

  if (proxiedLogo) {
    return (
      <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-black/15 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]">
        <span className="absolute inset-0 z-0 flex items-center justify-center bg-neutral-100 text-[10px] font-bold text-neutral-500">
          {letter}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-step="api"
          src={proxiedLogo}
          alt=""
          loading="lazy"
          decoding="async"
          className={imgClass}
          onError={chainImageError}
        />
      </span>
    );
  }

  if (!hasDomain) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-black/15 bg-white text-xs font-bold text-neutral-500 shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]">
        {letter}
      </div>
    );
  }

  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-black/15 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]">
      <span className="absolute inset-0 z-0 flex items-center justify-center bg-neutral-100 text-[10px] font-bold text-neutral-500">
        {letter}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-step="clearbit"
        src={clearbit}
        alt=""
        loading="lazy"
        decoding="async"
        className={imgClass}
        onError={(e) => {
          chainImageError(e);
        }}
      />
    </span>
  );
}

function subtitleLine(hit: TTLookupResult): string {
  if (hit.domain?.trim()) return hit.domain.trim().toLowerCase();
  const t = (hit.type ?? "").toLowerCase();
  if (t === "brandtracker") return "Your tracker";
  return "Advertising page";
}

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
  maxSaved = 3,
}: {
  onPick: (p: CompetitorPick | null) => void;
  sortBy: SortBy;
  onSortBy: (s: SortBy) => void;
  maxSaved?: number;
}) {
  const [query, setQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<TTLookupResult[]>([]);
  const [selectedLookup, setSelectedLookup] = useState<TTLookupResult | null>(null);

  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const trackedIds = useMemo(() => new Set(trackers.map((t) => t.id)), [trackers]);

  const [saved, setSaved] = useState<IntelligenceCompetitor[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);

  const lookupAbortRef = useRef<AbortController | null>(null);

  const selectedLookupId = selectedLookup?.id ?? null;

  const maxedOut = useMemo(() => {
    if (!selectedLookup) return saved.length >= maxSaved;
    const alreadySaved = saved.some((c) => (c.lookupId ?? c.id) === selectedLookup.id);
    return saved.length >= maxSaved && !alreadySaved;
  }, [maxSaved, saved, selectedLookup]);

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

  const executeLookup = useCallback(
    async (rawQ: string) => {
      const q = rawQ.trim();
      if (q.length < 2) return;

      lookupAbortRef.current?.abort();
      const ctrl = new AbortController();
      lookupAbortRef.current = ctrl;

      setLookupLoading(true);
      setLookupError(null);
      setLookupResults([]);
      setSelectedLookup(null);
      onPick(null);
      setSearchedOnce(true);
      try {
        const res = await fetch(
          `/api/intelligence/lookup?q=${encodeURIComponent(q)}&type=${encodeURIComponent("advertiser")}`,
          { signal: ctrl.signal },
        );
        const json = (await res.json()) as TTLookupResult[] | { error?: string };
        if (ctrl.signal.aborted) return;
        if (!Array.isArray(json)) {
          setLookupError(typeof json?.error === "string" ? json.error : "Search failed");
          return;
        }
        const limited = json.slice(0, 36);
        setLookupResults(limited);
        if (limited.length === 1) {
          const one = limited[0]!;
          setSelectedLookup(one);
          onPick({ lookup: one, isTracked: trackedIds.has(one.id) });
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setLookupError("Network error");
      } finally {
        if (!ctrl.signal.aborted) setLookupLoading(false);
      }
    },
    [onPick, trackedIds],
  );

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      setLookupResults([]);
      setLookupError(null);
      setSearchedOnce(false);
      setSelectedLookup(null);
      onPick(null);
      setLookupLoading(false);
      return;
    }

    const tid = window.setTimeout(() => {
      void executeLookup(trimmed);
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(tid);
      lookupAbortRef.current?.abort();
    };
  }, [executeLookup, onPick, query]);

  const selectLookup = useCallback(
    (r: TTLookupResult) => {
      setSelectedLookup(r);
      onPick({ lookup: r, isTracked: trackedIds.has(r.id) });
    },
    [onPick, trackedIds],
  );

  const saveSelected = useCallback(async () => {
    if (!selectedLookup || saving) return;
    const alreadySaved = saved.some(
      (c) => (c.lookupId ?? c.id) === selectedLookup.id,
    );
    if (!alreadySaved && saved.length >= maxSaved) {
      setLookupError(`You can save up to ${maxSaved} competitors.`);
      return;
    }
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
  }, [maxSaved, refreshSaved, saved, saving, selectedLookup]);

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
              if (e.key === "Enter") void executeLookup(query);
            }}
            placeholder="Paste a competitor domain or brand…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50"
          />
        </div>
        <button
          type="button"
          onClick={() => void executeLookup(query)}
          disabled={query.trim().length < 2 || lookupLoading}
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
          disabled={!selectedLookup || saving || maxedOut}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.07]",
            (!selectedLookup || saving) && "cursor-not-allowed opacity-50",
          )}
          title={
            !selectedLookup
              ? "Pick a competitor from the list first."
              : maxedOut
                ? `Max ${maxSaved} competitors saved.`
                : "Save competitor"
          }
        >
          <Star className="h-3.5 w-3.5" />
          Save
        </button>
      </div>

      {lookupError ? <p className="px-1 text-xs text-red-400">{lookupError}</p> : null}

      {searchedOnce && !lookupLoading && lookupResults.length === 0 && !lookupError ? (
        <p className="px-1 text-xs text-white/45">
          No advertisers matched. Try another spelling or paste a domain (e.g. example.com).
        </p>
      ) : null}

      {lookupResults.length > 0 ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-1">
          {lookupResults.map((r) => {
            const active = r.id === selectedLookupId;
            const isTracked = trackedIds.has(r.id);
            return (
              <button
                key={`${r.type}:${r.id}`}
                type="button"
                onClick={() => selectLookup(r)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                  active ? "bg-violet-500/15 text-white" : "text-white/80 hover:bg-white/5",
                )}
              >
                <CompetitorDomainAvatar domain={r.domain} logoUrl={r.logo ?? r.logoUrl} name={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{r.name}</div>
                  <div className="truncate text-[11px] text-white/55">{subtitleLine(r)}</div>
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
              <div
                key={c.id}
                className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    selectLookup({
                      id: c.lookupId ?? c.id,
                      name: c.name,
                      type: c.lookupId ? "brandtracker" : "advertiser",
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
                  className="rounded-lg border border-white/10 bg-black/20 p-2 text-white/55 opacity-0 transition hover:bg-white/[0.06] hover:text-white/80 group-hover:opacity-100"
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
