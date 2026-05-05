"use client";

import { useCallback, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { TTLookupResult } from "@/lib/trendtrack";

export function TrackerSearch({
  onResult,
}: {
  onResult: (result: TTLookupResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as TTLookupResult[] | { error: string };
      if (!Array.isArray(data)) {
        setError(data.error ?? "Search failed");
        onResult(null);
      } else {
        onResult(data[0] ?? null);
        if (!data[0]) setError("No brand found.");
      }
    } catch {
      setError("Network error");
      onResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, onResult]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search brand or domain…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50 focus:ring-0"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 px-1">{error}</p>}
    </div>
  );
}
