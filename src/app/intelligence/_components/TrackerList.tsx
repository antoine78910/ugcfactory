"use client";

import { useEffect, useState } from "react";
import type { TTTracker, TTLookupResult } from "@/lib/trendtrack";

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}

function TrackerCard({
  name,
  logo,
  activeAds,
  newAdsLast7Days,
  isSelected,
  onClick,
}: {
  name: string;
  logo?: string;
  activeAds?: number;
  newAdsLast7Days?: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
        isSelected
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      {logo ? (
        <img src={logo} alt={name} className="h-8 w-8 rounded-lg object-contain bg-white/10 p-1" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-xs font-bold text-violet-300">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-white">{name}</span>
        <span className="text-xs text-white/40">
          {activeAds ?? 0} active ads
          {newAdsLast7Days ? ` · +${newAdsLast7Days} this week` : ""}
        </span>
      </div>
      {newAdsLast7Days && newAdsLast7Days > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300">
          +{newAdsLast7Days}
        </span>
      ) : null}
    </button>
  );
}

export type SelectedTracker = {
  id: string;
  name: string;
  logo?: string;
  sourceType: "tracker" | "search";
};

export function TrackerList({
  selectedId,
  onSelect,
  searchResult,
}: {
  selectedId?: string;
  onSelect: (t: SelectedTracker) => void;
  searchResult?: TTLookupResult | null;
}) {
  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/intelligence/trackers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrackers(data as TTTracker[]);
        else setError(data.error ?? "Failed to load trackers");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <p className="text-xs text-red-400">{error}</p>;

  return (
    <div className="flex flex-col gap-2">
      {searchResult && (
        <TrackerCard
          name={searchResult.name}
          logo={searchResult.logo ?? searchResult.logoUrl}
          isSelected={selectedId === searchResult.id}
          onClick={() =>
            onSelect({
              id: searchResult.id,
              name: searchResult.name,
              logo: searchResult.logo ?? searchResult.logoUrl,
              sourceType: searchResult.type === "brandtracker" ? "tracker" : "search",
            })
          }
        />
      )}
      {trackers.map((t) => (
        <TrackerCard
          key={t.id}
          name={t.name}
          logo={t.logo ?? t.logoUrl ?? t.favicon}
          activeAds={t.activeAds}
          newAdsLast7Days={t.newAdsLast7Days}
          isSelected={selectedId === t.id}
          onClick={() =>
            onSelect({
              id: t.id,
              name: t.name,
              logo: t.logo ?? t.logoUrl ?? t.favicon,
              sourceType: "tracker",
            })
          }
        />
      ))}
      {trackers.length === 0 && !searchResult && (
        <p className="text-xs text-white/40 px-2">No trackers yet. Search for a brand above.</p>
      )}
    </div>
  );
}
