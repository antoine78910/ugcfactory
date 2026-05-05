# Intelligence Dashboard v2 — Redesign Spec
**Date:** 2026-05-05
**Status:** Approved (pending user review of this doc)
**Scope:** Re-skin and TrendTrack-integration polish for the existing `/intelligence` page. Builds on the v1 spec at `docs/superpowers/specs/2026-05-05-intelligence-dashboard-design.md` — this doc supersedes the UI/UX sections.

---

## 1. Goal

Bring `/intelligence` up to the same level of visual and interaction polish as the rest of the Youry studio, and make the TrendTrack integration richer and more usable. Two themes:

- **UI/UX & branding** — wrap the page in `StudioShell` so it shares the Youry chrome (rail, glow, raised violet buttons, glass cards). Tighten layout, error states, micro-interactions.
- **Richer TrendTrack connection** — multi-result search dropdown (instead of "first hit"), credits indicator, last-refresh timestamps, typed errors, "Save as tracker" affordance, platform context on ads, hook export.

Out of scope: pipeline injection (TrendTrack → Link to Ad), comparison view, sparklines, click-to-filter angles → ads, auto-poll/webhooks.

---

## 2. Architecture changes

### Modified files

- `src/lib/studioPaths.ts` — add `intelligence` to `AppSection` + `SECTION_TO_SLUG` so `isStudioShellPath("/intelligence")` returns true. Slug = `intelligence`.
- `src/app/_components/StudioShell.tsx` — add an `intelligence` entry to `CREATE_NAV` with the `Telescope` lucide icon and a `beta: true` pill (replaces the current `soon: true` placeholder added in commit `30645ab9`). Keep the entry's behavior identical to other route entries (no special collapse).
- `src/app/intelligence/page.tsx` — wrap the page in `StudioShell` (server component pattern: render `<StudioShell><IntelligenceClient … /></StudioShell>`).
- `src/app/intelligence/_components/IntelligenceClient.tsx` — re-skin: remove the standalone `bg-[#0a0a0f]` shell, use Youry tokens (`bg-[#050507]` is now provided by `StudioShell`; this component renders only the dual-pane content). Add the violet glow blob locally is *not* needed (StudioShell already provides it).
- `src/app/intelligence/_components/TrackerSearch.tsx` — replace single-hit behavior with a dropdown that lists up to 8 `/v1/lookup` results. Trigger = Enter (no debounce auto-suggest, to keep the request count predictable). Each row: logo, name, domain, type badge.
- `src/app/intelligence/_components/TrackerList.tsx` — visual polish only: align card style with `navButtonClass` family (raised on selected, glass on hover). Sort options: alpha by default; secondary sort by `newAdsLast7Days` desc available via a small toggle in the header.
- `src/app/intelligence/_components/TrackerDetail.tsx` — split the current header + Overview block into a dense **hero strip** (logo, name, type badge, domain, inline stats, refresh-all, credits chip). Remove the standalone Overview `<section>`. Keep the four content blocks (Top Ads, Angles, Hooks, Opportunities) but unify card style with `border-white/10 bg-white/[0.04] backdrop-blur rounded-2xl p-5`.
- `src/app/intelligence/_components/AdCard.tsx` — add hover state (subtle violet glow, scale 1.02), platform badge top-left, reach pill bottom-right, click → opens `AdModal`.
- `src/app/intelligence/_components/HooksTable.tsx` — add per-row `Copy` button, `Export CSV` button in the block header, sort toggle (reach / first-seen).
- `src/app/intelligence/_components/OpportunitiesPanel.tsx` — render opportunities as numbered violet-accent cards (1-5). Add a secondary CTA "→ Use in Ads Studio" linking to `/ads-studio?prefill=<encoded brief>` when the opportunity has an actionable brief field.
- `src/lib/trendtrack.ts` — replace generic `Error("TrendTrack 404 …")` with a typed error class `TrendTrackError` carrying `{ status: number; code: "auth" | "rate_limit" | "not_found" | "server" | "unknown"; retryAfterSec?: number; raw: string }`. Callers can `if (err instanceof TrendTrackError)` to render targeted UI.
- All `src/app/api/intelligence/**/route.ts` files — when catching `TrendTrackError`, forward `status` and a structured body `{ error, code, retryAfterSec }` instead of the current generic `502`. Keep cache-fallback behavior: on 5xx with a stale-but-existing cache entry, return the stale data with a `staleAt` field so the UI can show "Cached • Live API down".

### New files

- `src/app/intelligence/_components/IntelligenceHero.tsx` — the dense header described above. Self-contained: takes `tracker`, `overview`, `lastRefresh` and a `onRefreshAll` callback.
- `src/app/intelligence/_components/AdModal.tsx` — full-screen modal: large creative (image or video), full headline + body, platform, reach, first-seen, "Copy hook" button, "Open original ad" link.
- `src/app/intelligence/_components/CreditsChip.tsx` — chip pulling `/api/intelligence/usage` once on mount. Color: violet > 5k credits, ambre 1-5k, rouge < 1k. No polling.
- `src/app/intelligence/_components/SearchDropdown.tsx` — controlled dropdown used by `TrackerSearch`, list of results + keyboard nav (↑↓ Enter Esc).
- `src/app/api/intelligence/usage/route.ts` — GET, server-only, calls `GET /v1/usage` (0 credits) on TrendTrack, caches 5 min in `intelligence_cache`, returns `{ remaining, used, plan }` shape.

### NOT created (deferred)

- `src/app/api/intelligence/trackers/save/route.ts` — TrendTrack does not document a public "create brandtracker" endpoint at this time. The "+ Save as tracker" UX **falls back** to a local "pinned searches" feature (Supabase table `intelligence_pinned`, user-scoped), so the user can re-open searched brands across sessions without paying for `/v1/ads/query` again. If TrendTrack later exposes a creation endpoint we swap the implementation without changing the UI.
- `src/app/api/intelligence/pinned/route.ts` — GET (list user's pinned non-tracker brands), POST (pin), DELETE (unpin). Backed by new Supabase table:
  ```sql
  create table if not exists intelligence_pinned (
    user_id uuid not null references auth.users(id) on delete cascade,
    advertiser_id text not null,
    name text not null,
    logo text,
    domain text,
    created_at timestamptz default now(),
    primary key (user_id, advertiser_id)
  );
  ```

These two are part of this scope but flagged here so reviewers know the trade-off (no real TT-side persistence; pinned is a local affordance).

---

## 3. UX details

### 3.1 Studio shell integration
- Rail entry: `Intelligence` with `Telescope` icon (lucide), `beta: true` pill, no `soon`.
- Active highlight matches the current `navButtonClass` raised-violet treatment.
- Rail collapse behavior identical to other CREATE entries (manual user toggle only — no auto-collapse like Workflow / Ads Studio).

### 3.2 Page layout (post-redesign)
```
┌─ StudioShell rail (Youry) ─┐ ┌───────── /intelligence content ─────────────────┐
│ CREATE                    │ │ ┌── trackers sub-sidebar (320px) ──┐ ┌── main ──┐
│ • Link to Ad              │ │ │ search input                     │ │ HERO     │
│ • Ads Studio (Soon)       │ │ │ TRACKERS header + sort toggle    │ │ TopAds   │
│ • Workflow                │ │ │ tracker cards (sticky scroll)    │ │ Angles   │
│ • Avatar / …              │ │ │                                  │ │ Hooks    │
│ • Intelligence  [Beta]    │ │ └──────────────────────────────────┘ │ Opps     │
│ ─                         │ │                                      └──────────┘
│ My Projects               │ │
└───────────────────────────┘ └─────────────────────────────────────────────────┘
```
- Sub-sidebar background: `#06070d` (matches the Youry rail).
- Cards: `border-white/10 bg-white/[0.04] backdrop-blur-sm rounded-2xl`.
- Section spacing: `gap-5` between blocks (down from `gap-6` for density).

### 3.3 Hero strip
Single row, two columns:
- **Left:** brand logo (48px, `rounded-xl`), name (text-lg semibold), type badge (`Your tracker` violet / `Searched brand` neutral), domain link (text-xs, opens in new tab), "last refresh N min ago" (computed from the most recent successful block fetch — overview/ads/angles/opportunities).
- **Right:** inline stats (active ads, total traffic, rank if present), `↻ Refresh all` ghost button, `CreditsChip` showing TT credits remaining.

When `tracker.sourceType === "search"`, stats may be absent (search results don't have overview data). Show a neutral placeholder line "Search result — limited stats" instead of the stat numbers.

### 3.4 Search dropdown
- Trigger: Enter key (no auto-suggest debounce — `/v1/lookup` is 0 credits but we still avoid hammering).
- Renders below the input, max-height 320px, scrollable.
- Each row: 32px logo, name, domain (muted), type badge.
- Keyboard: ↑↓ navigate, Enter to select, Esc closes.
- Click outside closes.
- Empty results → row "No brand found for '<q>'" + suggestion "Try the domain (e.g. nike.com)".

### 3.5 Top Ads — modal viewer
- Click an `AdCard` opens `AdModal`.
- Modal: large creative, hook text, body text, platform, reach, first-seen, "Copy hook" (uses Clipboard API), "Open original ad" external link.
- Close: Esc, click backdrop, or X icon.

### 3.6 Hooks — copy + export
- Per-row `📋` button → copies the hook string.
- Block header `Export CSV` button → downloads `hooks-<brand-slug>-<YYYY-MM-DD>.csv` with columns `hook, reach, platform, first_seen`.

### 3.7 Opportunities — Ads Studio handoff
- Each opportunity card: number badge (1-5), title, 2-line explanation, optional CTA "→ Use in Ads Studio" if the LLM response includes a `brief` field.
- Update the Claude prompt for opportunities (`src/app/api/intelligence/trackers/[id]/opportunities/route.ts`) to ask for an optional one-sentence `brief` field per opportunity, suitable as a prefill prompt for Ads Studio.

### 3.8 Loading / error states
- **Loading skeletons** unchanged in shape, but tinted with the Youry palette (`bg-white/[0.04]`).
- **Error mapping** in client components based on response body `code`:
  - `auth` → "TrendTrack key invalid. Contact admin." (no retry button)
  - `rate_limit` → "Rate-limited. Retry in {retryAfterSec}s." (auto-enable retry button when timer expires)
  - `not_found` → "Brand has no data on TrendTrack."
  - `server` → "TrendTrack momentarily unavailable. Showing cached snapshot from {staleAt}." if a stale cache entry is available; otherwise a plain retry button.
  - `unknown` / network → generic "Network error" with retry.

### 3.9 Micro-interactions
- Primary CTAs (Search submit, Save as tracker / Pin, Refresh all): raised violet style — `bg-violet-400 text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] hover:bg-violet-300 active:translate-y-[2px]`.
- Card hover: `shadow-[0_0_20px_rgba(139,92,246,0.15)]`.
- Tracker card selected: `border-violet-500/60 bg-violet-500/10` (current behavior, kept).
- Transitions: 150-200ms ease-out on color/shadow only (no layout transitions on hover).

---

## 4. Data flow (unchanged + additions)

```
Client
  → /api/intelligence/* (Next route)
    → trendtrackCache.ts: check Supabase cache
      → HIT: return cached
      → MISS:
          → trendtrack.ts call (typed errors now)
              → ok: cache + return
              → TrendTrackError: forward status + code to client
                  → on 5xx, return stale cache if any with { staleAt }
    → (angles / opportunities) → claudeResponses.ts (unchanged, cached as v1 spec)
```

New endpoint:
- `GET /api/intelligence/usage` → cached 5 min, returns `{ remaining, used, plan }`.

New persistence:
- Supabase table `intelligence_pinned` (per-user, see schema above) — replaces a real "save tracker" since TT has no public creation endpoint.

---

## 5. Credits & cache (re-confirmation)

TTLs and per-endpoint costs unchanged from v1 spec. Two additions:
- `usage:summary` cache key, TTL 5 min, source `GET /v1/usage` (0 credits).
- Stale fallback: when TrendTrack returns 5xx and a previous cache entry exists (even if `expires_at` has passed), the API route returns it with a `staleAt` flag rather than failing. Stale entries live indefinitely in `intelligence_cache` since the table only has `expires_at` as a soft filter — the row stays until next overwrite or manual cleanup.

No automatic background polling. Refresh remains a per-block explicit action.

---

## 6. Security
Inherits v1: `TRENDTRACK_API_KEY` server-only, all calls behind `requireSupabaseUser`, no key in client bundle. New `/api/intelligence/pinned` and `/api/intelligence/usage` follow the same auth gate.

---

## 7. Testing approach
- Component-level: `TrackerSearch` dropdown keyboard nav, `AdModal` open/close + copy, `HooksTable` CSV export shape.
- Integration: typed-error mapping (mock `ttFetch` to throw each `TrendTrackError` code; assert UI message).
- Manual smoke: open page logged in, search a brand, save as pinned, open the modal, copy a hook, force refresh a block, observe credits chip, simulate 429 by stubbing `Retry-After` header.

---

## 8. Out of scope (locked)
- Pipeline injection TrendTrack → Link to Ad (Phase 2 of v1 spec).
- Comparison view between two trackers.
- Sparklines / time-series of active ads.
- Click-to-filter angles → ads.
- Auto-polling / webhooks / notifs.
- Real "create brandtracker" via TrendTrack — deferred until TT exposes the endpoint.

---

## 9. Files summary

**Modified:** `src/lib/studioPaths.ts`, `src/app/_components/StudioShell.tsx`, `src/app/intelligence/page.tsx`, `src/app/intelligence/_components/IntelligenceClient.tsx`, `src/app/intelligence/_components/TrackerSearch.tsx`, `src/app/intelligence/_components/TrackerList.tsx`, `src/app/intelligence/_components/TrackerDetail.tsx`, `src/app/intelligence/_components/AdCard.tsx`, `src/app/intelligence/_components/HooksTable.tsx`, `src/app/intelligence/_components/OpportunitiesPanel.tsx`, `src/lib/trendtrack.ts`, all `src/app/api/intelligence/**/route.ts`.

**New:** `src/app/intelligence/_components/IntelligenceHero.tsx`, `src/app/intelligence/_components/AdModal.tsx`, `src/app/intelligence/_components/CreditsChip.tsx`, `src/app/intelligence/_components/SearchDropdown.tsx`, `src/app/api/intelligence/usage/route.ts`, `src/app/api/intelligence/pinned/route.ts`, `supabase/intelligence_pinned.sql`.
