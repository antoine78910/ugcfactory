# Credit Metering Fix + Admin Generation Tracking

**Date:** 2026-05-05
**Status:** Design approved, pending implementation plan

## Problem

Two related issues affecting generation tracking and billing:

1. **Comp-plan creators (and all paid users) are never debited.** The current rule `shouldChargePlatformCredits = planId === "free"` (in `register/route.ts:78`, `start/route.ts:87`, `prompt-enhance/route.ts:46`, `me/credits/spend/route.ts:28-32`) means only free/trial users consume credits. Stripe subscribers and partners with comp plans get effectively unlimited usage, even though their plan tier defines a monthly quota and their `user_credit_grants` ledger row is correctly seeded.

2. **`/admin` Generations view does not surface enough information.** Input media is collapsed to a single "Link to Ad URL" cell showing only `input_urls[0]`. There is no way to filter by user, no date range filter, no per-user spending recap, no thumbnails for input media. The owner observed "many users have the same balance, it never decreases" — a direct symptom of issue #1, not visible because the admin currently displays balance snapshots without enough context.

## Goals

- Every paid user (Starter / Growth / Pro / Scale, Stripe or comp) is debited from their monthly credit pool, like a free/trial user.
- Existing comp-plan users redeemed before this change are debited automatically going forward (no migration needed: their `user_credit_grants` rows already exist).
- When a user's balance is insufficient to cover a generation, the request is blocked **before** the external provider is called, and a modal offers an upgrade or a credit pack purchase.
- `/admin` Generations exposes input media (videos, audio, images) with previews, filters by user/email/date, per-user spending recap, and richer global stats.

## Non-goals

- No retroactive billing of past generations that ran free (gone, not recoverable).
- No change to how subscription credits are seeded or refilled (Stripe webhook + `resetSubscriptionCredits` keep their current behavior).
- No new credit ledger column. We use existing `credits_charged`, `credit_balance_after`, `input_urls`, `result_urls`.
- No automatic monthly top-up for comp plans (already an explicit product rule per `redeem/route.ts:309`).
- "Unlimited emails" (staff/internal) and personal API key users remain exempt.

## Architecture

Three coordinated changes shipped together:

### 1. Backend metering rule flip + pre-flight balance gate

**Rule change** — at every metering call site, replace:
```ts
shouldChargePlatformCredits = planId === "free" && !usesPersonalApi;
```
with:
```ts
const unlimited = isSubscriptionUnlimitedEmail(email);
shouldChargePlatformCredits = !usesPersonalApi && !unlimited;
```

**Touch points:**
- `src/app/api/studio/generations/register/route.ts:78`
- `src/app/api/studio/generations/start/route.ts:87`
- `src/app/api/studio/prompt-enhance/route.ts:46`
- `src/app/api/me/credits/spend/route.ts:28-32` — drop the `planId !== "free"` early return; let `spendUserCredits` run for everyone.

**Pre-flight gate** — at the entry of every endpoint that initiates an external generation (KIE, Kling, Wavespeed, ElevenLabs, NanoBanana), before any provider HTTP call:
```ts
if (shouldChargePlatformCredits) {
  const { balance } = await getUserCreditBalance(admin, user.id);
  if (balance < creditsDisplay) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", need: creditsDisplay, have: balance, planId },
      { status: 402 },
    );
  }
}
```

**Endpoints to gate:**
- `src/app/api/studio/generations/start/route.ts` (image gen)
- `src/app/api/kling/generate/route.ts` (video)
- `src/app/api/kie/veo/generate/route.ts` (Veo video)
- `src/app/api/wavespeed/video-translate/route.ts`
- `src/app/api/elevenlabs/speech-to-speech/route.ts`
- `src/app/api/nanobanana/generate/route.ts`
- `src/app/api/kling/motion-control/route.ts`
- `src/app/api/kling/video-edit/route.ts`
- `src/app/api/kie/upscale/image/route.ts`
- `src/app/api/kie/upscale/video/route.ts`
- `src/app/api/studio/prompt-enhance/route.ts`

For chained pipelines (`/api/link-to-ad/initial-pipeline`, `/api/link-to-ad/continue-scripts`), the gate applies to the first cost the pipeline incurs; downstream steps trust the upstream balance check.

HTTP **402 Payment Required** is the canonical signal — the frontend reads 402 and surfaces the modal without showing a generic error toast.

### 2. Out-of-credits modal + guarded fetch helper

**New shared component:** `src/app/_components/OutOfCreditsModal.tsx`. Mounted once globally in `StudioShell.tsx`. Shows:
- Cost vs balance (`need` / `have`).
- Two CTAs:
  - Free user → "Voir les plans" (`/pricing`) + "Acheter un pack" (`/credits`).
  - Paid user → "Upgrade vers le plan supérieur" (`/pricing`) + "Acheter un pack" (`/credits`).
- Next refill date when paid user (read from `user_credit_grants.expires_at` of the active subscription grant).

**New helper:** `src/lib/guardedFetch.ts`. Wraps `fetch`. On HTTP 402 with body `{ error: "INSUFFICIENT_CREDITS", … }`:
1. Dispatches a `window` custom event `out-of-credits` with `{ need, have, planId }`.
2. Returns `{ blocked: true, response }` so callers short-circuit (no provider call, no toast).
3. On any other response, returns `{ blocked: false, response }` unchanged.

The modal listens to the event globally — no prop drilling needed.

**Migration of call sites:** every component that currently calls `fetch("/api/...")` to start a generation switches to `guardedFetch(...)`. Found via grep on the gated endpoint list above.

### 3. `/admin` Generations enrichments

**3.1 — "Inputs" column** (replaces existing "Link to Ad URL" column):
- Inline mini-chips with typed icons: image / video / audio / url (non-media). Counter if > 3.
- Type detection via new helper `src/lib/admin/detectInputMediaType.ts` — extension + Supabase storage path heuristics.
- Expanded row shows full thumbnails 80×80 (mirrors existing `result_urls` rendering at `admin/page.tsx:1913-1941`), with `<audio controls>` for sound files.

**3.2 — Filters bar additions:**
- Email freetext filter (with `emailMap`-backed autocomplete suggestions).
- Date range pickers (`from`, `to`, HTML5 `<input type="date">`).
- Sortable headers on Charged / Balance after / When (clickable, asc/desc state).

**3.3 — Per-user recap card** — shown above the table when an email filter is active:
- User email + plan + comp expiry.
- Current ledger balance (live).
- Credits spent in current calendar month (sum of `credits_charged` where `created_at >= start_of_month`).
- Status breakdown of their generations (ready / failed / processing counts).

**3.4 — Global stats card additions** — alongside existing 4 cards (Total Generations / Total Users / Credits Spent / Runs):
- Credits spent last 30 days (vs all-time).
- Top 5 users by spend (clickable chips that auto-filter the table).
- Failure rate % (red highlight if > 5%).

**3.5 — Row badges:**
- 🎁 partner — when the row's user has an active `complimentary_subscriptions` row (data already fetched as `activeCompPlans` at `admin/page.tsx:684`).
- ⚠️ — sentinel for `credit_balance_after < 0` (should never happen; visible alert if it does).

**API surface changes:**
- `GET /api/admin/generations` accepts new query params: `email`, `from`, `to`, `sort` (one of `charged|balance|when`), `order` (`asc|desc`).
- `GET /api/admin/stats` returns extra fields: `creditsSpent30d`, `topUsersBySpend` (array of `{ user_id, email, total }`), `failureRatePct`.

## Data flow — credit deduction lifecycle

```
[User clicks Generate]
        │
        ▼
[Frontend: guardedFetch(POST /api/{provider}/generate)]
        │
        ▼
[Backend: pre-flight gate]
        │
        ├── shouldChargePlatformCredits === false ──► call provider, register row with credits_charged=0
        │
        └── shouldChargePlatformCredits === true
                │
                ▼
        [getUserCreditBalance → balance]
                │
                ├── balance < cost ──► 402 INSUFFICIENT_CREDITS ──► modal opens
                │
                └── balance >= cost
                        │
                        ▼
                [call external provider]
                        │
                        ▼
                [POST /api/studio/generations/register]
                        │  • spendUserCredits(cost)
                        │  • insert row with credits_charged=cost
                        │  • snapshot credit_balance_after
                        ▼
                [admin sees: cost X, balance Y → Y-X]
```

## Components and isolation

| Unit | Responsibility | Depends on |
|------|---------------|------------|
| `shouldChargePlatformCredits` rule | Single source of truth for who pays | `getUserPlan`, `isSubscriptionUnlimitedEmail` |
| Pre-flight gate (per endpoint) | Reject 402 before provider call | `getUserCreditBalance`, cost estimate |
| `guardedFetch` | Intercept 402 → fire event | `window.dispatchEvent` |
| `OutOfCreditsModal` | Render + route to upgrade/pack | Listens to `out-of-credits` event |
| `detectInputMediaType(url)` | Pure function: url → `image|video|audio|url` | None |
| `/api/admin/generations` (extended) | Filter/sort generations | Supabase admin client |
| Per-user recap card | Aggregate one user's stats | `/api/admin/generations?email=…&summary=1` |

Each unit is independently testable. The metering rule change is the smallest possible diff (4 lines × 4 files). The gate, modal, and admin enrichments are additive.

## Error handling

- **Pre-flight gate fails to read balance** (DB error): return 503, frontend shows generic error (not 402, since we cannot prove insufficient credits).
- **Race condition between gate and spend** (balance changes between check and `spendUserCredits` call): `spendUserCredits` returns `< amount`; existing handlers in `prompt-enhance/route.ts:62-67` already detect this and refund partial spend. Same pattern applied to gated endpoints.
- **Provider call succeeds but `register` debit fails**: existing behavior (row inserted with `credits_charged=0` and warn-log). Acceptable — no change.
- **Modal shown but user has no upgrade path** (already on Scale, max plan): "Acheter un pack" remains the only CTA; "Upgrade" hidden if `planId === "scale"`.
- **Comp user runs out mid-month**: modal shows. Admin can issue a fresh redeem link; user redeems, `addPackCredits` tops up.

## Testing

Manual test matrix (one row per persona):

| Persona | Plan | Personal API | Expected behavior |
|---------|------|--------------|-------------------|
| Free user, has 5 cr, gen costs 3 | free | no | Generates, balance → 2 |
| Free user, has 1 cr, gen costs 3 | free | no | 402 → modal → upgrade/pack CTAs |
| Stripe Growth user, has 100 cr | growth | no | Generates, balance debited |
| Stripe Growth user, has 0 cr | growth | no | 402 → modal → upgrade/pack |
| Comp Pro user (redeemed link), has 50 cr | pro | no | Generates, balance debited |
| Comp Pro user, has 0 cr | pro | no | 402 → modal → upgrade/pack |
| Personal API user (KIE key) | any | yes | Generates, no debit |
| Unlimited email (staff) | any | no | Generates, no debit |

Admin verification:
- After each test, open `/admin` → generations → confirm new row shows correct `credits_charged` and `credit_balance_after`.
- Filter by email → confirm recap card shows correct totals.
- Apply date filter → confirm rows filter correctly.
- Click sortable column → confirm reorder.

## Rollout

1. Deploy with the metering flip + pre-flight gates + modal in one PR.
2. Watch `/admin` Generations for 24h:
   - Confirm `credits_charged > 0` rows appear for paid users.
   - Confirm no spike in 402 responses among paid users (would indicate misestimated quotas).
3. If a critical regression is found, the metering flip is reversible by reverting the 4-line rule change without rolling back the gates or admin work (they are additive).

## Files modified / added

**Backend metering:**
- M `src/app/api/studio/generations/register/route.ts`
- M `src/app/api/studio/generations/start/route.ts`
- M `src/app/api/studio/prompt-enhance/route.ts`
- M `src/app/api/me/credits/spend/route.ts`
- M each generation endpoint listed under "Endpoints to gate" above

**Frontend modal:**
- A `src/app/_components/OutOfCreditsModal.tsx`
- A `src/lib/guardedFetch.ts`
- M `src/app/_components/StudioShell.tsx` (mount modal)
- M every component calling a gated endpoint (replace `fetch` with `guardedFetch`)

**Admin tracking:**
- M `src/app/admin/page.tsx` (Inputs column, filters, recap, sort, badges)
- M `src/app/api/admin/generations/route.ts` (new query params)
- M `src/app/api/admin/stats/route.ts` (30d, top users, failure rate)
- A `src/lib/admin/detectInputMediaType.ts`

## Open questions

None at design freeze. Implementation plan to enumerate exact endpoint cost calculations and the list of frontend `fetch` call sites to migrate to `guardedFetch`.
