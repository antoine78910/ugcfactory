# Intelligence Dashboard — Design Spec
**Date:** 2026-05-05  
**Status:** Approved  
**Scope:** Standalone `/intelligence` page (Phase 1 — no pipeline injection yet)

---

## 1. Goal

Add a competitive intelligence dashboard to Youry that surfaces top-performing ad creatives, dominant creative angles, hooks, and opportunities — powered by TrendTrack data enriched with Claude analysis. The feature is white-labeled (zero TrendTrack branding in UI), accessible at `/intelligence` but hidden from the main nav during testing.

---

## 2. Architecture

### New files

```
src/
├── app/
│   ├── intelligence/
│   │   ├── page.tsx                            # Page entry (server component, auth-gated)
│   │   └── _components/
│   │       ├── TrackerList.tsx                 # Grid of existing trackers
│   │       ├── TrackerSearch.tsx               # Free-brand search input
│   │       ├── TrackerDetail.tsx               # Drill-down view (5 blocks)
│   │       ├── AdCard.tsx                      # Single ad card (thumbnail + reach + platform)
│   │       ├── AnglesChart.tsx                 # Donut + list of Claude-extracted angles
│   │       ├── HooksTable.tsx                  # Raw hooks table sorted by reach
│   │       └── OpportunitiesPanel.tsx          # 5 Claude-generated opportunities
│   └── api/
│       └── intelligence/
│           ├── trackers/route.ts               # GET /v1/brandtrackers (proxied)
│           ├── trackers/[id]/overview/route.ts # GET /v1/brandtrackers/{id}/overview
│           ├── trackers/[id]/top-ads/route.ts  # GET /v1/brandtrackers/{id}/top-ads
│           ├── lookup/route.ts                 # GET /v1/lookup (zero-credit)
│           └── ads/query/route.ts              # POST /v1/ads/query (free search)
├── lib/
│   ├── trendtrack.ts                           # Server-only TrendTrack API client
│   └── trendtrackCache.ts                      # Supabase cache layer (TTL-based)
```

### Modified files

- `src/app/app/[...sections]/page.tsx` — no nav changes (intelligence hidden)
- Supabase: add `intelligence_cache` table:
  ```sql
  create table intelligence_cache (
    key text primary key,
    data jsonb not null,
    expires_at timestamptz not null,
    created_at timestamptz default now()
  );
  ```

### Data flow

```
Client component
  → fetch /api/intelligence/*
    → trendtrackCache.ts: check Supabase cache
      → HIT: return cached JSON
      → MISS: call TrendTrack API via trendtrack.ts
              → store in cache with TTL
              → return JSON
    → (angles/opportunities) → claudeResponses.ts
              → cache result keyed by hash of ad IDs
```

---

## 3. Features

### 3.1 Main page `/intelligence`

Layout: fixed left sidebar (tracker list) + main content area (detail panel). On mobile: stacked.

- **Left sidebar** — scrollable list of tracker cards pulled from `/v1/brandtrackers`: brand logo, name, active ad count, "N new ads this week" badge. Sidebar stays visible when a tracker is selected.
- **Top of main area** — search bar (domain or brand name). Calls `/v1/lookup` (0 credits) first to resolve, then fetches detail. Search results appear as a temporary card in the sidebar.
- Clicking a sidebar card or search result loads the **Tracker Detail** in the main area.

### 3.2 Tracker Detail (5 blocks)

**Block 1 — Overview**
Stats strip: active ads, total reach, rank. Source: `/v1/brandtrackers/{id}/overview`. Cache: 24h.

**Block 2 — Top Ads**
Grid of up to 10 `AdCard` components. Each card: creative thumbnail, platform badge (Meta/TikTok), reach number, launch date, "View" link. Source: `/v1/brandtrackers/{id}/top-ads?limit=10`. Cache: 1h.

**Block 3 — Dominant Angles**
Donut chart + ranked list with percentages. Claude (`claude-sonnet-4-6`) receives the 10 top ads (headline + body text) in one prompt and returns 4–6 labelled angles (e.g. "Social proof 38%", "Fear of missing out 22%"). Result cached 6h keyed by `angles:{brandId}:{sha256(adIds)}`.

**Block 4 — Hooks**
Simple table: hook text | reach | platform. Extracted from raw `headline`/`body` fields of top ads. Sorted descending by reach. Zero Claude tokens.

**Block 5 — 5 Opportunities**
Single `claude-sonnet-4-6` prompt receives: angles of THIS tracker + angles of the user's own trackers (pre-cached from their prior visits) → returns 5 gap opportunities as titled cards with a 2-line explanation each. Cache: 12h. If the user's own tracker angles aren't cached yet (never visited), this block shows a prompt to visit their own trackers first.

---

## 4. Credit Optimization

### TrendTrack credit table

| Endpoint | Est. credits | Cache TTL | When called |
|---|---|---|---|
| `GET /v1/lookup` | 0 | 24h | Brand search |
| `GET /v1/me` | 0 | — | API key validation |
| `GET /v1/usage` | 0 | — | Admin/debug |
| `GET /v1/brandtrackers` | ~1 | 1h | Page load |
| `GET /v1/brandtrackers/{id}/overview` | ~2 | 24h | Open tracker |
| `GET /v1/brandtrackers/{id}/top-ads` | ~5 | 1h | Open tracker |
| `POST /v1/ads/query` | ~3–10 | 1h | Free search |

**Estimated cost per session (all cache misses):** ~8 credits to open one tracker. With 1h TTL, a full day of heavy use ≈ 50–70 credits max.

### Rules implemented in code

1. Always call `/v1/lookup` (0 credits) before any paid endpoint to resolve brand IDs.
2. Top ads capped at **10 results** per request.
3. Claude runs **once per ad batch**, not per ad.
4. Opportunities use **one single prompt** comparing all own trackers vs target tracker.
5. API key lives server-side only — never exposed to client.
6. UI exposes a **"Refresh"** button per block that bypasses cache (explicit user action only).

---

## 5. Design System

- Palette: Youry violet (`#7C3AED` family), dark backgrounds
- Cards: `border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl`
- Skeleton loaders on all async blocks
- Zero mention of "TrendTrack" anywhere in UI copy or component names exposed to users
- Terminology: "Tracker" (not "Brand Tracker"), "Intelligence" (not "Spy tool")

---

## 6. Security

- `TRENDTRACK_API_KEY` stored in `.env.local`, never in client bundle
- All TrendTrack calls made from Next.js API routes (server-side only)
- `/intelligence` page gated behind existing Supabase auth check
- Cache keys never include the raw API key

---

## 7. Out of Scope (Phase 1)

- Injecting TrendTrack context into the link-to-ad pipeline (Phase 2)
- Email intelligence endpoints
- Shop similarity features
- Workspace-level analytics

---

## 8. Credit Documentation

A separate `docs/intelligence-credits.md` will be generated alongside the implementation explaining each endpoint's credit cost, cache TTL, how to force refresh, and how to monitor usage via `GET /v1/usage`.
