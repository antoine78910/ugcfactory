# Intelligence — Competitor Checker (TrendTrack) Design

**Date:** 2026-05-06  
**Owner:** Youry Intelligence  
**Goal:** Add a white-labeled competitor checker flow to `/intelligence` powered by TrendTrack, with saved competitors per user.

## Problem

Users want to paste a competitor **domain** (or **brand name**) and quickly see the competitor’s **top ads**, sorted by different “what’s working” signals, then reuse the existing “recreate brief” flow (extract transcript/body/CTA → generate differentiated UGC brief).

Constraints:
- **Zero TrendTrack branding** in UI copy.
- TrendTrack API key must remain **server-only** (`TRENDTRACK_API_KEY` in `.env.local`).
- Prefer low TrendTrack credit usage via **Supabase TTL cache** (`intelligence_cache`).
- UX must support cases where `lookup` returns **multiple matches** (user chooses before fetching ads).

## Success criteria

- A new **Competitors** section exists in `/intelligence`.
- User can paste `domain.com` or a brand name; the system runs **lookup first**, then shows a dropdown to select the intended advertiser.
- The selected advertiser can be saved and re-opened later (per-user list).
- Ads fetch supports a **SortBy** dropdown (default: `currentRank`).
- Fetch routing rule:
  - If advertiser is **Tracked** AND `sortBy=currentRank`: use canonical `brandtrackers/{id}/top-ads`.
  - Otherwise: use `ads/query` so all sorts work reliably.
- Responses are cached with TTL and support `force=true` refresh like the existing Intelligence blocks.

## Existing system (current code)

Already present in `ugc-automation`:
- TrendTrack client: `src/lib/trendtrack.ts`  
  - `ttLookup`, `ttListTrackers`, `ttGetTopAds`, `ttQueryAds`, `ttGetUsage`
- Cache layer (Supabase): `src/lib/trendtrackCache.ts` using `intelligence_cache`
- API routes:
  - `GET /api/intelligence/lookup?q=…` (cached, 24h)
  - `GET /api/intelligence/trackers` (cached, 1h)
  - `GET /api/intelligence/trackers/[id]/top-ads` (cached, 1h; currently no sortBy param)
  - `POST /api/intelligence/ads/query` (cached, 1h)
- UI components under `src/app/intelligence/_components/*`
- Existing “recreate” flow for ads: `src/app/intelligence/_components/AdRecreateDialog.tsx` + `POST /api/intelligence/recreate/script`

This design builds on those primitives and keeps the orchestration server-side (recommended).

## User flow (B: choose match before fetch)

### Step 1 — Lookup
1. User enters a value (domain or brand) into Competitors input.
2. UI calls:
   - `GET /api/intelligence/lookup?q=<input>`
   - `GET /api/intelligence/trackers` (or reuse already-loaded trackers list)
3. UI renders a dropdown list of lookup results (**All results**), each row shows:
   - Name
   - Domain (if any)
   - Badge: **Tracked** if `lookup.id` is present in the tracker IDs, else **Not tracked**

### Step 2 — Select + Fetch top ads
User selects a row, then UI calls one “smart” endpoint:
- `GET /api/intelligence/competitors/top-ads?lookupId=<id>&q=<normalized>&sortBy=<sort>&force=true|false`

Server-side logic:
- Determine `isTracked` by comparing `lookupId` with cached `ttListTrackers()` results.
- Routing:
  - If `isTracked && sortBy === "currentRank"`:
    - Call TrendTrack: `GET /v1/brandtrackers/{id}/top-ads?sortBy=currentRank`
  - Else:
    - Call TrendTrack: `POST /v1/ads/query` with:
      - `searchType`: `"domain"` if `q` parses as a hostname, else `"brand"`
      - query key(s) include both `q` and optional `domain` hint
      - `sortBy`: requested sort
      - `limit`: 10

### Step 3 — Save competitor (per-user)
User can click “Save” on the selected competitor:
- `POST /api/intelligence/competitors` stores it in Supabase (per-user).
Saved competitors appear as chips / list items under “Competitors”.

## Sort options

Expose a sort dropdown using TrendTrack’s supported `sortBy` values:
- `currentRank` (default)
- `reach`
- `reachDelta1d`, `reachDelta7d`, `reachDelta30d`
- `rankDelta7d`, `rankDelta14d`, `rankDelta30d`
- `longestRunning`

## API design (new routes)

### 1) GET `/api/intelligence/competitors`
Returns saved competitors for the logged-in user.

Response shape:
```ts
type IntelligenceCompetitor = {
  id: string;            // uuid row id
  lookupId: string | null;
  name: string;
  domain: string | null;
  createdAt: string;
};
```

### 2) POST `/api/intelligence/competitors`
Creates a saved competitor.

Request:
```json
{ "lookupId": "tt_xxx", "name": "Nike", "domain": "nike.com" }
```

Server:
- Requires auth via `requireSupabaseUser`
- Upsert behavior optional (dedupe by `user_id + lookup_id` when present; otherwise `user_id + lower(domain) + lower(name)`).

### 3) DELETE `/api/intelligence/competitors/[id]`
Deletes a saved competitor row (must match `user_id`).

### 4) GET `/api/intelligence/competitors/top-ads`
Parameters:
- `lookupId` (optional but preferred): stable ID from TrendTrack lookup
- `q` (required): normalized input string (domain/brand)
- `sortBy` (required): one of the sort options above
- `force` (optional): `true` deletes cache and re-fetches

Returns:
```ts
{
  source: "tracker_top_ads" | "ads_query";
  isTracked: boolean;
  sortBy: string;
  ads: TTAd[];
}
```

## Caching strategy

Reuse `intelligence_cache` TTL table via `trendtrackCache.ts`.

Suggested keys:
- `competitor:{lookupId}:{sortBy}:top-ads` (preferred when lookupId provided)
- `competitor:q:{hash}:{sortBy}:top-ads` (fallback when lookupId missing)

TTL:
- 1 hour (same as `tracker:{id}:top-ads` and `ads:query:*`)

Force refresh:
- If `force=true`, delete the computed key before fetching.

## Supabase schema (new table)

Create `intelligence_competitors` (per user):

```sql
create table if not exists public.intelligence_competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lookup_id text,
  name text not null,
  domain text,
  created_at timestamptz default now()
);

create index if not exists intelligence_competitors_user_id_idx
  on public.intelligence_competitors(user_id);

create unique index if not exists intelligence_competitors_user_lookup_id_uniq
  on public.intelligence_competitors(user_id, lookup_id)
  where lookup_id is not null;
```

RLS:
- Enable RLS
- Policy: user can select/insert/delete only their own rows (`auth.uid() = user_id`)

## UI design (Competitors section)

Place under existing Intelligence sidebar (recommended next to Trackers):

- **Header:** “Competitors”
- **Input:** “Paste a competitor domain or brand…”
- **Lookup dropdown:** shows all matches with Tracked / Not tracked badge (B flow).
- **Controls:**
  - Sort dropdown (default `currentRank`)
  - Refresh button (passes `force=true`)
  - Save button (saves selected competitor)
- **Saved list:** chips/cards for saved competitors:
  - click → loads its ads with current sort
  - delete icon → removes row

Ads list rendering can reuse existing `AdCard` / `AdModal`.

## Error handling

Use existing `respondTrendTrackError` for TrendTrack failures.

UI mapping:
- auth error → “Data provider key invalid. Contact admin.”
- not found / no data → “No data for this advertiser.”
- rate limit / server → “Provider temporarily unavailable. Try again.”

Never surface “TrendTrack” as a brand in user-facing strings.

## Testing / verification plan

- **Unit-ish (route-level):**
  - `competitors/top-ads` uses tracker path only when `sortBy=currentRank` and tracked.
  - Otherwise uses ads/query path.
  - Cache keys stable and `force=true` bypasses cache.
- **Manual:**
  - Paste `nike.com` → multiple lookup results → dropdown selection required → top ads load.
  - Sort changes trigger a new fetch + correct cache key.
  - Save competitor → appears in list after refresh.
  - Delete competitor → removed from list.

## Out of scope (for this slice)

- Automatically generating the “differentiated UGC brief” from a competitor set (beyond reusing existing recreate dialog).
- Workspace/team-shared competitors (we store per-user only).
- Automatic background refresh.

