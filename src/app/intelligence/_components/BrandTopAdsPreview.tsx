"use client";

/**
 * Top-creatives preview rendered inside the "Your brands" dialog right after a brand is picked
 * from the header search bar. Fires on top of the existing TrendTrack flow:
 *
 *   1. `POST /v1/advertisers/query` (sort_by=active_ads, limit=3) — already done by the lookup route.
 *   2. `POST /v1/ads/query` (trend_signal=reach_growth_7d, active_only=true, limit=10) — driven
 *      by the parent via `loadSearchResultTopAds`.
 *
 * Reuses `AdCard` (same component the Intelligence dashboard uses for own-brand ads) so the
 * styling, hover behaviour, and "Recreate" affordance stay consistent across surfaces.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import type { TTAd, TTLookupResult } from "@/lib/intelligenceProvider";
import { AdCard } from "./AdCard";

export type BrandTopAdsState =
  | { kind: "idle" }
  | { kind: "loading"; brandId: string }
  | { kind: "ready"; brandId: string; ads: TTAd[] }
  | { kind: "error"; brandId: string; message: string };

const SKELETON_TILE_COUNT = 6;

function SkeletonTile() {
  return (
    <div
      aria-hidden
      className="aspect-[9/16] w-full animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]"
    />
  );
}

export function BrandTopAdsPreview({
  brand,
  state,
  onRetry,
}: {
  brand: TTLookupResult;
  state: BrandTopAdsState;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white/90">
            Top creatives — {brand.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-white/45">
            Sorted by 7-day reach growth · active ads only
            {typeof brand.activeAds === "number" && brand.activeAds > 0 ? (
              <span className="ml-2 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/70">
                {brand.activeAds} active
              </span>
            ) : null}
          </p>
        </div>
        {state.kind === "ready" || state.kind === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/65 transition hover:border-violet-400/40 hover:text-white"
            title="Refresh top creatives"
          >
            <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
          </button>
        ) : null}
      </header>

      {state.kind === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: SKELETON_TILE_COUNT }).map((_, i) => (
            <SkeletonTile key={i} />
          ))}
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-100/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Couldn&apos;t load top creatives.</p>
            <p className="mt-0.5 text-[11px] text-red-200/65">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.08]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        state.ads.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-[12px] text-white/45">
            TrendTrack has no active creatives indexed for {brand.name} yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {state.ads.map((ad, i) => (
              <AdCard
                key={ad.id || `${brand.id}:${i}`}
                ad={ad}
                brandName={brand.name}
                playVideoOnHover
                showRecreateShortcut
              />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
