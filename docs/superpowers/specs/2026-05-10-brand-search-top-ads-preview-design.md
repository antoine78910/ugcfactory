# Brand search: auto-load top creatives preview

## Context

Today the Intelligence header search bar runs the brand discovery call (TrendTrack `/v1/advertisers/query`, mapped via [src/app/api/intelligence/lookup/route.ts](../../../src/app/api/intelligence/lookup/route.ts)). When the user picks a result, [TrackerList](../../../src/app/intelligence/_components/TrackerList.tsx) renders a brand card inside the "Your brands" dialog. **The user has to click the card to navigate to `TrackerDetail` to finally see top creatives.**

The desired flow per the user's spec:

> "Quand je tape une brand ou competitor dans la barre, 2 appels API dans l'ordre :
> 1. `search_advertisers` (POST /v1/advertisers/query, `search_in=brand`, `sort_by=active_ads`, `limit=3`) — already wired.
> 2. `search_ads` (POST /v1/ads/query, `trend_signal=reach_growth_7d`, `active_only=true`, `limit=10`) — top creatives shown immediately."

Both endpoints already exist and match the spec:

- Call 1 → `searchAdvertisersForBar` in [lookup/route.ts:36-51](../../../src/app/api/intelligence/lookup/route.ts#L36-L51).
- Call 2 → `competitor_ads_query` path in [competitors/top-ads/route.ts:135-160](../../../src/app/api/intelligence/competitors/top-ads/route.ts#L135-L160) (when `sortBy=currentRank`, the server maps it to `reachDelta7d` which is TrendTrack's internal name for `reach_growth_7d`).

The gap is purely front-end: nothing triggers Call 2 until the user clicks the brand card. The fix wires Call 2 to fire the moment a search result is set.

## Design

### State + fetch (parent component)

Add to [IntelligenceClient.tsx](../../../src/app/intelligence/_components/IntelligenceClient.tsx):

```ts
type SearchResultAdsState =
  | { kind: "idle" }
  | { kind: "loading"; brandId: string }
  | { kind: "ready"; brandId: string; ads: TTAd[] }
  | { kind: "error"; brandId: string; message: string };

const [searchResultAds, setSearchResultAds] = useState<SearchResultAdsState>({ kind: "idle" });
```

In the existing `handleSearchResult` callback:

- When `result === null` → reset to `{ kind: "idle" }`, abort any in-flight controller.
- When `result` is set → set `{ kind: "loading", brandId: result.id }`, kick off:

```ts
fetch(
  `/api/intelligence/competitors/top-ads?` +
    `q=${encodeURIComponent(result.name)}` +
    `&name=${encodeURIComponent(result.name)}` +
    `&lookupId=${encodeURIComponent(result.id)}` +
    `&sortBy=currentRank`,
  { signal: abortRef.current.signal },
);
```

Abort the previous controller before each new fetch so fast typing doesn't pile up callbacks. Response shape is `{ source, isTracked, sortBy, ads: TTAd[] }` — store `ads` and `source`.

### Component: `BrandTopAdsPreview`

New file [src/app/intelligence/_components/BrandTopAdsPreview.tsx](../../../src/app/intelligence/_components/BrandTopAdsPreview.tsx).

Props:

```ts
{
  brand: TTLookupResult;
  state: SearchResultAdsState;
  onRetry: () => void;
}
```

Renders:

- A small header: brand logo + name + sub-line "Top creatives · last 7d reach growth" + active-ads pill (uses `brand.activeAds` from Call 1).
- If `state.kind === "loading"` → 6 placeholder skeleton tiles (animate-pulse, same 9:16 aspect as `AdCard`).
- If `state.kind === "ready"` →
  - Empty: small empty-state copy ("This brand has no active ads in TrendTrack.").
  - Non-empty: grid of `<AdCard ad={ad} brandName={brand.name} showRecreateShortcut />` (max 10).
- If `state.kind === "error"` → inline error pill + Retry button.

The grid mirrors how `IntelligenceOverviewDashboard` renders own-brand ads, so the look is consistent across surfaces.

### Wiring inside the "brands" dialog

In [IntelligenceClient.tsx](../../../src/app/intelligence/_components/IntelligenceClient.tsx), the dialog body for `panel === "brands"`:

```tsx
{panel === "brands" ? (
  <div className="flex flex-col gap-4">
    <TrackerList selectedId={selected?.id} onSelect={setSelected} searchResult={searchResult} />
    {searchResult ? (
      <BrandTopAdsPreview
        brand={searchResult}
        state={searchResultAds}
        onRetry={() => /* re-call the same fetch */ null}
      />
    ) : null}
  </div>
) : ...}
```

When `searchResult` is null, the preview is unmounted (and the in-flight fetch is aborted by the effect cleanup).

## Out of scope

- Inline preview inside the search dropdown (3-ad thumbnail strip per result row) — separate UX, follow-up if requested.
- Auto-fetch top ads for **competitor** picks (`CompetitorDetail` already does this on mount; no change needed).
- Backfilling poster URLs or video thumbnails — `AdCard` uses TrendTrack's `imageUrl` field which is already small.
- Persisting the searched brand without explicit user action (the existing `TrackerSaveButton` already covers this).

## Risks & mitigations

- **Provider credit cost** — Call 2 fires on every search result selection. The route caches per `(lookupId, sortBy)` for 7 days ([top-ads/route.ts:20](../../../src/app/api/intelligence/competitors/top-ads/route.ts#L20)), so a user typing the same brand twice in a week pays the cost once. The TrackerSearch debounces 320 ms and aborts in-flight lookups; this spec adds the same discipline to the ads fetch.
- **UI flash** — a fast picker click could trigger Call 2, then a brand-deselect, then another Call 2 in rapid succession. AbortController on each new search guards against stale renders.
- **Empty results** — TrendTrack `ads/query` can legitimately return zero ads (private pages, fresh advertisers). Empty state copy clarifies this; not an error.

## Success criteria

- Typing "CapCut" → dropdown shows result → click → "Your brands" dialog (or already open) shows: brand card + 10 `AdCard` tiles with thumbnails, reach metrics, copy, landing-page links.
- Total wall-clock latency to first ads tile: under 2 s with cold cache, sub-200 ms with warm cache (Supabase KV).
- No new lint errors; no typecheck regressions.

## Validation plan

1. `npx tsc --noEmit` clean.
2. `npx eslint` clean for touched files.
3. Manual smoke test against staging:
   - Search "CapCut" → preview loads 5-10 active ads with reach + copy.
   - Search a junk string → preview either shows empty-state copy or doesn't render (because searchResult is null).
   - Rapid-fire typing → no console warnings, no leaked fetches (DevTools Network panel).
4. Confirm cache: second search of the same brand within 7d returns instantly (Network panel shows the call but the route returns from `getCached`).
