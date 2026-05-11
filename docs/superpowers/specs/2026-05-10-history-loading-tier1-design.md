# History loading — Tier 1 quick wins

## Problem

`GET /api/studio/generations` regularly takes ~1 minute and produces "ghost data" (rows appearing minutes after completion). The 6 history surfaces (Studio image / video / motion-control / upscale, Workflow runs, Ads Studio projects) all read from the same `studio_generations` table through this single endpoint.

## Root cause (evidence-based)

The GET endpoint at [src/app/api/studio/generations/route.ts:71-91](../../../src/app/api/studio/generations/route.ts) is doing five separate jobs on every request:

1. A write transaction (`markStaleInProgressStudioGenerationsFailedForUser`) that updates rows older than 48h.
2. The actual list query — in `all=1` mode this fan-outs to 16 parallel `select("*")` calls, each returning up to 500 rows ([src/lib/studioGenerationsListQuery.ts:25-46](../../../src/lib/studioGenerationsListQuery.ts#L25-L46)).
3. `sweepStudioRefundHints` ×16 kinds, each doing `SELECT failed rows` followed by a per-row `UPDATE` inside a JS loop ([src/lib/studioGenerationsPoll.ts:310-323](../../../src/lib/studioGenerationsPoll.ts#L310-L323)).
4. Synchronous poll of up to 12 in-flight rows by calling KIE / PiAPI / WaveSpeed externally (each external call: 3–10 s).
5. A full re-fetch of the list to absorb step 4's mutations.

Each background poll tick (4.5 s, [src/app/_components/StudioGenerationsBackgroundPoll.tsx:27](../../../src/app/_components/StudioGenerationsBackgroundPoll.tsx#L27)) hits the same path, so when a user has any in-flight job the server is permanently busy. The 1-minute load is the **sequential KIE polling inside the GET** colliding with the background poll, not slow SQL.

The "ghost data" symptom is the concurrent-poll race: the GET's inline poll fetches a row, the background poll also fetches it, both attempt to update; the client sees the second response and treats it as "new" data appearing late.

Indexes are fine: `(user_id, kind, created_at desc)` already covers every list query ([supabase/studio_generations.sql:31](../../../supabase/studio_generations.sql#L31)).

## Tier 1 changes (this spec)

### 1. GET becomes a pure read

Remove the inline KIE poll block (`pollStudioGenerationRow` × 12) and the post-poll re-fetch from the GET handler. The background poll endpoint (`POST /api/studio/generations/poll`) already exists for this purpose and runs every 4.5 s — no functionality is lost; "generating" rows simply update on the next background tick instead of during the GET round-trip.

Files: [src/app/api/studio/generations/route.ts](../../../src/app/api/studio/generations/route.ts)

### 2. Throttle `markStaleInProgressStudioGenerationsFailedForUser`

This UPDATE runs on every GET but is a no-op for most users (it only flips rows older than 48 h). Wrap it in a per-process LRU keyed by `user_id` with a 10-minute TTL, so it runs at most once per 10 minutes per user.

Files: [src/lib/studioGenerationsStale.ts](../../../src/lib/studioGenerationsStale.ts) (add throttle helper) + [src/app/api/studio/generations/route.ts](../../../src/app/api/studio/generations/route.ts) (use throttled version).

### 3. Throttle `sweepStudioRefundHints`

Same pattern: per-user-per-kind LRU with 60-second TTL. Refund hints only matter when a job has just failed; the background poll route already calls `sweepStudioRefundHints` after each KIE poll. Running it from the GET path 16 times per request is wasted work.

Files: [src/lib/studioGenerationsPoll.ts](../../../src/lib/studioGenerationsPoll.ts) (add throttle wrapper) + GET route.

### 4. Replace the per-row loop in `sweepStudioRefundHints` with one UPDATE…RETURNING

```ts
// Before: SELECT then loop with per-row UPDATE
const { data, error } = await supabase
  .from("studio_generations")
  .update({ credits_refund_hint_sent: true })
  .eq("user_id", userId).eq("kind", kind)
  .eq("status", "failed").eq("credits_refund_hint_sent", false)
  .gt("credits_charged", 0)
  .select("id, credits_charged");
```

The `update().select()` form is one round-trip and uses the same row-level filters. Rows that are concurrently modified get filtered out naturally by the `eq("credits_refund_hint_sent", false)` predicate.

Files: [src/lib/studioGenerationsPoll.ts](../../../src/lib/studioGenerationsPoll.ts).

### 5. Lower the `all=1` caps

- `STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT`: 500 → **100**
- `STUDIO_GENERATIONS_ALL_MERGED_MAX`: 3000 → **600**

Rationale: the Projects library currently renders up to 3000 rows in one DOM blast, which is itself a UX antipattern; 600 covers 99% of users. Heavier users will need a follow-up "load older" mechanic for `all=1` (out of scope here — flagged in the followups section).

Files: [src/lib/studioGenerationKinds.ts](../../../src/lib/studioGenerationKinds.ts).

### 6. Replace `select("*")` with an explicit column list

Audited the mapper at [src/lib/studioGenerationsMap.ts:185-258](../../../src/lib/studioGenerationsMap.ts#L185-L258) — the list response actually needs:
`id, created_at, kind, status, label, model, external_task_id, result_urls, input_urls, error_message, credits_refund_hint_sent, aspect_ratio`.

Columns NOT used by the list mapper: `user_id`, `updated_at`, `completed_at`, `started_at`, `provider`, `credits_charged`, `uses_personal_api`. Dropping these from the list payload removes per-row overhead (especially `started_at` / `completed_at` which serialise to ISO strings).

Files: [src/lib/studioGenerationsListQuery.ts](../../../src/lib/studioGenerationsListQuery.ts) (both queries — the `all=1` fan-out and the kind-filtered query).

## Out of scope (Tier 2/3, not this spec)

- Client-side cache (React Query / SWR) — Tier 2.
- Adaptive background polling (only when in-flight) — Tier 2.
- KIE webhook to retire polling entirely — Tier 3.
- `all=1` cursor pagination — followup, decoupled from this spec.

## Risks & mitigations

- **Risk:** completion lag for in-flight jobs grows from "synchronous inside GET" to "next background poll tick" (~4.5 s). **Mitigation:** acceptable — the background poll runs continuously while the user is on /app, and the user's *initial* page load gets ~3-5 s faster.
- **Risk:** in-process throttle LRU is per-Node-instance, so on a multi-pod deployment each pod runs the stale-marker independently. **Mitigation:** acceptable — even at 10 pods × 1 run per 10 min = 1 run per minute, still ~50× less than today.
- **Risk:** dropping columns from the list response could break a consumer that reads e.g. `provider` from a row. **Mitigation:** audit all consumers of `/api/studio/generations` response payload before the change.

## Success criteria

- `GET /api/studio/generations?all=1` returns under 800 ms (currently several seconds when in-flight jobs exist).
- `GET /api/studio/generations?kind=studio_image` returns under 200 ms.
- Background poll continues to mark jobs ready within ~5 s of provider completion (unchanged from today).
- No regression in: history rendering, refund-hint toasts, workflow-run rehydration, ads-studio "Projects" rail.

## Validation plan

1. `npx tsc --noEmit` clean.
2. `npx eslint` clean for touched files (no new warnings).
3. Manual smoke test in dev:
   - Studio → Image tab: history loads, "Load more" works.
   - Studio → Video tab: same.
   - Submit a generation: appears in history immediately, transitions ready within ~5 s after provider completes.
   - Workflow editor: in-flight overlay rehydrates on reload.
   - Ads Studio Projects rail: prior generations visible.
4. Compare timings before/after in DevTools Network panel for `/api/studio/generations?all=1`.
