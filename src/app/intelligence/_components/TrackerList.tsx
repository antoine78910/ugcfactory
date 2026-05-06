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
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        isSelected
          ? "border-violet-400/55 bg-violet-500/12 shadow-[0_0_18px_rgba(139,92,246,0.18)]"
          : "border-white/10 bg-white/[0.04] hover:border-violet-400/35 hover:bg-white/[0.07] hover:shadow-[0_0_14px_rgba(139,92,246,0.10)]"
      }`}
    >
      {logo ? (
        <img
          src={logo}
          alt={name}
          className="h-8 w-8 overflow-hidden rounded-lg border border-black/15 bg-white object-contain p-0.5 shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/15 bg-white text-xs font-bold text-neutral-500 shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]">
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
  domain?: string;
  /** From tracker list TrendTrack snapshot; fills hero metrics when overview lacks fields. */
  activeAds?: number;
  totalTraffic?: number;
  rank?: number;
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
  const [pinned, setPinned] = useState<
    Array<{ advertiser_id: string; name: string; logo: string | null; domain: string | null }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/trackers")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setTrackers(data as TTTracker[]);
        else setError(data.error ?? "Failed to load trackers");
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/pinned")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setPinned(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <p className="text-xs text-red-400">{error}</p>;

  return (
    <div className="flex flex-col gap-2">
      {searchResult && (
        <div className="relative">
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
                domain: searchResult.domain ?? undefined,
              })
            }
          />
          {searchResult.type === "brandtracker" ? (
            <TrackerSaveButton
              tracker={{
                tracker_id: searchResult.id,
                name: searchResult.name,
                logo: searchResult.logo ?? searchResult.logoUrl ?? null,
                domain: searchResult.domain ?? null,
              }}
              isSaved={trackers.some((t) => t.id === searchResult.id)}
              onChange={(next) =>
                setTrackers((prev) =>
                  next
                    ? [
                        {
                          id: searchResult.id,
                          name: searchResult.name,
                          domain: searchResult.domain ?? undefined,
                          logo: searchResult.logo ?? searchResult.logoUrl ?? undefined,
                        },
                        ...prev.filter((t) => t.id !== searchResult.id),
                      ]
                    : prev.filter((t) => t.id !== searchResult.id)
                )
              }
            />
          ) : (
            <PinButton
              advertiser={{
                advertiser_id: searchResult.id,
                name: searchResult.name,
                logo: searchResult.logo ?? searchResult.logoUrl ?? null,
                domain: searchResult.domain ?? null,
              }}
              isPinned={pinned.some((p) => p.advertiser_id === searchResult.id)}
              onChange={(next) =>
                setPinned((prev) =>
                  next
                    ? [
                        {
                          advertiser_id: searchResult.id,
                          name: searchResult.name,
                          logo: searchResult.logo ?? searchResult.logoUrl ?? null,
                          domain: searchResult.domain ?? null,
                        },
                        ...prev,
                      ]
                    : prev.filter((p) => p.advertiser_id !== searchResult.id)
                )
              }
            />
          )}
        </div>
      )}
      {pinned.length > 0 && (
        <>
          <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
            Pinned brands
          </p>
          {pinned.map((p) => (
            <TrackerCard
              key={`pinned:${p.advertiser_id}`}
              name={p.name}
              logo={p.logo ?? undefined}
              isSelected={selectedId === p.advertiser_id}
              onClick={() =>
                onSelect({
                  id: p.advertiser_id,
                  name: p.name,
                  logo: p.logo ?? undefined,
                  sourceType: "search",
                  domain: p.domain ?? undefined,
                })
              }
            />
          ))}
        </>
      )}
      {trackers.map((t) => (
        <div key={t.id} className="group relative">
          <TrackerCard
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
                domain: t.domain,
                activeAds: t.activeAds,
                totalTraffic: t.totalTraffic,
                rank: t.rank,
              })
            }
          />
          <TrackerRemoveButton
            trackerId={t.id}
            onRemoved={() => setTrackers((prev) => prev.filter((x) => x.id !== t.id))}
          />
        </div>
      ))}
      {trackers.length === 0 && !searchResult && (
        <p className="text-xs text-white/40 px-2">No trackers yet. Search for a brand above.</p>
      )}
    </div>
  );
}

function PinButton({
  advertiser,
  isPinned,
  onChange,
}: {
  advertiser: { advertiser_id: string; name: string; logo: string | null; domain: string | null };
  isPinned: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          if (isPinned) {
            await fetch(
              `/api/intelligence/pinned?advertiser_id=${encodeURIComponent(advertiser.advertiser_id)}`,
              { method: "DELETE" }
            );
            onChange(false);
          } else {
            await fetch("/api/intelligence/pinned", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(advertiser),
            });
            onChange(true);
          }
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="absolute right-2 top-2 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/65 transition hover:border-violet-400/40 hover:text-white disabled:opacity-50"
      title={isPinned ? "Unpin brand" : "Pin brand to revisit later"}
    >
      {isPinned ? "Pinned" : "+ Pin"}
    </button>
  );
}

function TrackerSaveButton({
  tracker,
  isSaved,
  onChange,
}: {
  tracker: { tracker_id: string; name: string; logo: string | null; domain: string | null };
  isSaved: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          if (isSaved) {
            await fetch(
              `/api/intelligence/trackers?tracker_id=${encodeURIComponent(tracker.tracker_id)}`,
              { method: "DELETE" }
            );
            onChange(false);
          } else {
            await fetch("/api/intelligence/trackers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(tracker),
            });
            onChange(true);
          }
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="absolute right-2 top-2 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/65 transition hover:border-violet-400/40 hover:text-white disabled:opacity-50"
      title={isSaved ? "Remove tracker" : "Save tracker to your list"}
    >
      {isSaved ? "Saved" : "+ Save"}
    </button>
  );
}

function TrackerRemoveButton({
  trackerId,
  onRemoved,
}: {
  trackerId: string;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        try {
          await fetch(`/api/intelligence/trackers?tracker_id=${encodeURIComponent(trackerId)}`, {
            method: "DELETE",
          });
          onRemoved();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="absolute right-2 top-2 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/65 opacity-0 transition hover:border-red-400/40 hover:text-white group-hover:opacity-100 disabled:opacity-40"
      title="Remove tracker"
    >
      Remove
    </button>
  );
}
