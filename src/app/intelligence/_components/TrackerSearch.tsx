"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { TTLookupResult } from "@/lib/intelligenceProvider";
import { SearchDropdown } from "./SearchDropdown";

const LOOKUP_DEBOUNCE_MS = 320;

export function TrackerSearch({
  onResult,
}: {
  onResult: (result: TTLookupResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TTLookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [emptyQuery, setEmptyQuery] = useState<string | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  const executeSearch = useCallback(
    async (rawQ: string) => {
      const q = rawQ.trim();
      if (q.length < 2) return;

      lookupAbortRef.current?.abort();
      const ctrl = new AbortController();
      lookupAbortRef.current = ctrl;

      setLoading(true);
      setError(null);
      setEmptyQuery(null);
      try {
        const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as TTLookupResult[] | { error: string; code?: string };
        if (ctrl.signal.aborted) return;
        if (!Array.isArray(data)) {
          setError(data.error ?? "Search failed");
          setResults([]);
          setOpen(false);
          onResult(null);
        } else {
          const limited = data.slice(0, 8);
          setResults(limited);
          setHighlighted(0);
          setOpen(true);
          if (limited.length === 0) setEmptyQuery(q);
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError("Network error");
        setResults([]);
        setOpen(false);
        onResult(null);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [onResult],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      setResults([]);
      setOpen(false);
      setEmptyQuery(null);
      setError(null);
      setHighlighted(0);
      setLoading(false);
      return;
    }

    const tid = window.setTimeout(() => {
      void executeSearch(trimmed);
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(tid);
      lookupAbortRef.current?.abort();
    };
  }, [executeSearch, query]);

  const pick = useCallback(
    (r: TTLookupResult) => {
      setOpen(false);
      onResult(r);
    },
    [onResult]
  );

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (open && results[highlighted]) pick(results[highlighted]);
                else void executeSearch(query);
              } else if (e.key === "ArrowDown") {
                if (results.length > 0) {
                  e.preventDefault();
                  setOpen(true);
                  setHighlighted((i) => (i + 1) % results.length);
                }
              } else if (e.key === "ArrowUp") {
                if (results.length > 0) {
                  e.preventDefault();
                  setHighlighted((i) => (i - 1 + results.length) % results.length);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Search brand or domain…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50 focus:ring-0"
          />
        </div>
        <button
          type="button"
          onClick={() => void executeSearch(query)}
          disabled={loading || query.trim().length < 2}
          className="flex items-center gap-1.5 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </div>
      {open && (
        <SearchDropdown
          results={results}
          highlightedIndex={highlighted}
          onHighlight={setHighlighted}
          onPick={pick}
          onClose={() => setOpen(false)}
          emptyQuery={results.length === 0 ? emptyQuery : null}
        />
      )}
      {error && <p className="text-xs text-red-400 px-1">{error}</p>}
    </div>
  );
}
