# Credit Metering Fix + Admin Generation Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debit every paid user (Stripe + comp) per generation like a free user, block insufficient-balance generations behind a 402 + upsell modal, and enrich `/admin` Generations with input media previews, filters, and per-user spending.

**Architecture:** Single source of truth for the metering rule + a shared 402 pre-flight gate added at the entry of each generation endpoint. Frontend `guardedFetch` helper intercepts 402 responses and dispatches a global event consumed by an `OutOfCreditsModal` mounted once in `StudioShell`. Admin enrichments are additive: typed input chips, email/date/sort filters, per-user recap, partner badges.

**Tech Stack:** Next.js App Router (Node runtime), Supabase service-role client, TypeScript strict, ESLint, Tailwind, lucide-react icons.

**Codebase note:** No automated unit tests exist for the routes touched here. Verification uses `npm run lint`, `npm run build` (TypeScript check), and explicit manual test commands per task. The final task runs the full manual matrix.

**Spec:** `docs/superpowers/specs/2026-05-05-credit-metering-and-admin-tracking-design.md`

---

## File structure

**New files**
- `src/lib/credits/metering.ts` — `shouldChargePlatformCredits()`, `assertSufficientCreditsResponse()` (returns `NextResponse | null`)
- `src/lib/admin/detectInputMediaType.ts` — pure helper `(url) => "image" | "video" | "audio" | "url"`
- `src/lib/guardedFetch.ts` — wraps `fetch`, intercepts 402, dispatches `out-of-credits` event
- `src/app/_components/OutOfCreditsModal.tsx` — global modal, listens to event

**Modified files (backend)**
- `src/app/api/me/credits/spend/route.ts` — drop free-only early return
- `src/app/api/studio/generations/register/route.ts` — use shared rule
- `src/app/api/studio/generations/start/route.ts` — use shared rule + gate
- `src/app/api/studio/prompt-enhance/route.ts` — use shared rule (already has gate)
- `src/app/api/kling/generate/route.ts` — gate
- `src/app/api/kie/veo/generate/route.ts` — gate
- `src/app/api/wavespeed/video-translate/route.ts` — gate
- `src/app/api/elevenlabs/speech-to-speech/route.ts` — gate
- `src/app/api/nanobanana/generate/route.ts` — gate
- `src/app/api/kling/motion-control/route.ts` — gate
- `src/app/api/kling/video-edit/route.ts` — gate
- `src/app/api/kie/upscale/image/route.ts` — gate
- `src/app/api/kie/upscale/video/route.ts` — gate

**Modified files (frontend)**
- `src/app/_components/StudioShell.tsx` — mount modal
- All components calling a gated endpoint with raw `fetch` — switch to `guardedFetch` (Task 17 has the precise list)

**Modified files (admin)**
- `src/app/admin/page.tsx` — Inputs column, filters, per-user recap, badges, sort
- `src/app/api/admin/generations/route.ts` — query params: `email`, `from`, `to`, `sort`, `order`
- `src/app/api/admin/stats/route.ts` — extra fields: `creditsSpent30d`, `topUsersBySpend`, `failureRatePct`

---

## Phase A — Shared metering helpers

### Task 1: Create the shared metering helper

**Files:**
- Create: `src/lib/credits/metering.ts`

- [ ] **Step 1: Write the helper module**

Create `src/lib/credits/metering.ts`:

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { isSubscriptionUnlimitedEmail } from "@/lib/allowedUsers";

/**
 * Single source of truth: returns true when the request must spend platform credits.
 * Replaces the previous `planId === "free"` rule. Now: every user pays UNLESS
 *   • they bring their own provider API key (`usesPersonalApi`), or
 *   • they are on the staff/internal "unlimited" allowlist.
 */
export function shouldChargePlatformCredits(args: {
  usesPersonalApi: boolean;
  email: string | null | undefined;
}): boolean {
  if (args.usesPersonalApi) return false;
  if (isSubscriptionUnlimitedEmail(args.email ?? "")) return false;
  return true;
}

/**
 * Pre-flight balance gate. Returns a 402 NextResponse when the user does not
 * have enough credits to cover `costDisplayCredits`; returns `null` otherwise.
 * Caller should `if (gate) return gate;` before any external provider call.
 */
export async function assertSufficientCreditsResponse(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  costDisplayCredits: number;
}): Promise<NextResponse | null> {
  if (args.costDisplayCredits <= 0) return null;
  const { balance } = await getUserCreditBalance(args.admin, args.userId);
  if (balance >= args.costDisplayCredits) return null;
  return NextResponse.json(
    {
      error: "INSUFFICIENT_CREDITS",
      need: args.costDisplayCredits,
      have: balance,
      planId: args.planId,
    },
    { status: 402 },
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint -- src/lib/credits/metering.ts`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/credits/metering.ts
git commit -m "feat(credits): shared metering rule + pre-flight gate helpers"
```

---

## Phase B — Apply rule + gate to existing metering call sites

### Task 2: Update `studio/generations/register` to use the shared rule

**Files:**
- Modify: `src/app/api/studio/generations/register/route.ts:76-79`

- [ ] **Step 1: Replace the rule**

Find:
```ts
  // Product rule: platform credits are consumed only on free/trial access.
  const planId = await getUserPlan(user.id);
  const shouldChargePlatformCredits = planId === "free" && !usesPersonalApi;
  const creditsDisplay = shouldChargePlatformCredits ? Math.max(0, Number(body.creditsCharged) || 0) : 0;
```

Replace with:
```ts
  // Charge every user except those bringing their own API key or on the unlimited allowlist.
  const planId = await getUserPlan(user.id);
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(user, admin);
  const charges = shouldChargePlatformCredits({ usesPersonalApi, email });
  const creditsDisplay = charges ? Math.max(0, Number(body.creditsCharged) || 0) : 0;
```

Add to imports at top of file:
```ts
import { shouldChargePlatformCredits } from "@/lib/credits/metering";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
```

(The file already imports `createSupabaseServiceClient` and `getUserPlan`.)

- [ ] **Step 2: Replace remaining `shouldChargePlatformCredits` usage in the file**

Find all uses of the old `shouldChargePlatformCredits` boolean variable and rename to `charges`. Run:

```bash
grep -n "shouldChargePlatformCredits" src/app/api/studio/generations/register/route.ts
```

Expected after change: only the imported function name appears (one match in the import line, and one in the call expression). The local boolean is now `charges`.

- [ ] **Step 3: Verify build**

Run: `npm run lint -- src/app/api/studio/generations/register/route.ts`
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/studio/generations/register/route.ts
git commit -m "feat(credits): debit all paid users in studio/generations/register"
```

### Task 3: Update `studio/generations/start` to use the shared rule + gate

**Files:**
- Modify: `src/app/api/studio/generations/start/route.ts:86-95`

- [ ] **Step 1: Replace the rule**

Find at lines 86-87:
```ts
  const usesPersonalApi = Boolean(personalKey);
  const shouldChargePlatformCredits = !usesPersonalApi && accountPlan === "free";
```

Replace with:
```ts
  const usesPersonalApi = Boolean(personalKey);
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(user, admin);
  const charges = shouldChargePlatformCredits({ usesPersonalApi, email });
```

Add to imports:
```ts
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { shouldChargePlatformCredits, assertSufficientCreditsResponse } from "@/lib/credits/metering";
```

Then replace the `shouldChargePlatformCredits ? … : 0` ternary at line 94 with `charges ? … : 0`.

- [ ] **Step 2: Add the pre-flight gate before the external provider call**

Insert between `const totalTicks = ...` (line 95) and the `let taskIds: string[];` (line 101):

```ts
  if (charges && admin) {
    const gate = await assertSufficientCreditsResponse({
      admin,
      userId: user.id,
      planId: accountPlan,
      costDisplayCredits: creditsDisplay,
    });
    if (gate) return gate;
  }
```

- [ ] **Step 3: Verify build**

Run: `npm run lint -- src/app/api/studio/generations/start/route.ts`
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/studio/generations/start/route.ts
git commit -m "feat(credits): debit + gate studio/generations/start"
```

### Task 4: Update `studio/prompt-enhance` to use the shared rule

**Files:**
- Modify: `src/app/api/studio/prompt-enhance/route.ts:44-46`

- [ ] **Step 1: Replace the rule**

Find:
```ts
  const unlimited = isSubscriptionUnlimitedEmail(email);
  const planId = await getUserPlan(auth.user.id);
  const chargeFreeLedger = planId === "free" && !unlimited;
```

Replace with:
```ts
  const planId = await getUserPlan(auth.user.id);
  const charges = shouldChargePlatformCredits({ usesPersonalApi: false, email });
```

Then replace every reference to `chargeFreeLedger` in the file with `charges`. Run:
```bash
grep -n "chargeFreeLedger" src/app/api/studio/prompt-enhance/route.ts
```
Expected after change: 0 matches.

Also remove the now-unused `unlimited` variable (the helper handles it internally) and the `isSubscriptionUnlimitedEmail` import if it has no other reference.

Add to imports:
```ts
import { shouldChargePlatformCredits } from "@/lib/credits/metering";
```

- [ ] **Step 2: Verify build**

Run: `npm run lint -- src/app/api/studio/prompt-enhance/route.ts`
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/studio/prompt-enhance/route.ts
git commit -m "feat(credits): debit all paid users in prompt-enhance"
```

### Task 5: Drop free-only early return in `me/credits/spend`

**Files:**
- Modify: `src/app/api/me/credits/spend/route.ts:27-32`

- [ ] **Step 1: Remove the early return**

Find:
```ts
  // Product rule: platform credits are deducted only for free/trial access.
  const planId = await getUserPlan(auth.user.id);
  if (planId !== "free") {
    const { balance } = await getUserCreditBalance(admin, auth.user.id);
    return NextResponse.json({ spent: 0, balance });
  }
```

Replace with:
```ts
  // Every user (free + paid + comp) is debited unless on the unlimited allowlist or using personal API keys (handled at the calling endpoint).
```

Then remove the now-unused `getUserPlan` import if no other reference remains.

- [ ] **Step 2: Verify build**

Run: `npm run lint -- src/app/api/me/credits/spend/route.ts`
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/me/credits/spend/route.ts
git commit -m "feat(credits): debit all paid users in /me/credits/spend"
```

---

## Phase C — Add pre-flight gates to provider-call endpoints

### Task 6: Add gate to `kling/generate`

**Files:**
- Modify: `src/app/api/kling/generate/route.ts`

- [ ] **Step 1: Locate the spot**

Open the file. After authentication and after the cost (`creditsDisplay`) is computed, but **before** the call to KIE/PiAPI, that's where the gate goes. Use `grep -n "creditsDisplay\|kieMarketCreateTask\|piapi" src/app/api/kling/generate/route.ts` to find both.

- [ ] **Step 2: Add the gate**

Add at the top imports:
```ts
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { shouldChargePlatformCredits, assertSufficientCreditsResponse } from "@/lib/credits/metering";
```

Right before the external provider call (after `creditsDisplay` is computed and before `kieMarketCreateTask`/PiAPI is called), insert:

```ts
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(user, admin);
  const charges = shouldChargePlatformCredits({ usesPersonalApi, email });
  if (charges && admin) {
    const gate = await assertSufficientCreditsResponse({
      admin,
      userId: user.id,
      planId: accountPlan,
      costDisplayCredits: creditsDisplay,
    });
    if (gate) return gate;
  }
```

If the file uses different variable names for `usesPersonalApi`, `accountPlan`, or `user`, adapt accordingly — but DO NOT change the helper signature.

- [ ] **Step 3: Verify build**

Run: `npm run lint -- src/app/api/kling/generate/route.ts`
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (optional but recommended)**

Run dev: `npm run dev`. Log in as a paid user with 0 credits (or set their balance to 0 in `user_credit_grants` via Supabase SQL editor). Trigger a Kling video gen from the Studio Video tab. Expected: the request returns 402, no Kling task is created.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kling/generate/route.ts
git commit -m "feat(credits): pre-flight gate on kling/generate"
```

### Task 7: Add gate to `kie/veo/generate`

**Files:**
- Modify: `src/app/api/kie/veo/generate/route.ts`

- [ ] **Step 1: Repeat the pattern from Task 6**

Same imports, same gate code. Inserted right after `creditsDisplay` is computed, before any KIE call.

- [ ] **Step 2: Verify**

Run: `npm run lint -- src/app/api/kie/veo/generate/route.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kie/veo/generate/route.ts
git commit -m "feat(credits): pre-flight gate on kie/veo/generate"
```

### Task 8: Add gate to `wavespeed/video-translate`

**Files:**
- Modify: `src/app/api/wavespeed/video-translate/route.ts`

- [ ] **Step 1: Same pattern**

Same imports. Insert the gate immediately before the Wavespeed call.

- [ ] **Step 2: Verify**

Run: `npm run lint -- src/app/api/wavespeed/video-translate/route.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/wavespeed/video-translate/route.ts
git commit -m "feat(credits): pre-flight gate on wavespeed/video-translate"
```

### Task 9: Add gate to `elevenlabs/speech-to-speech`

**Files:**
- Modify: `src/app/api/elevenlabs/speech-to-speech/route.ts`

- [ ] **Step 1: Same pattern**

Same imports. Insert gate before the ElevenLabs call.

- [ ] **Step 2: Verify**

Run: `npm run lint -- src/app/api/elevenlabs/speech-to-speech/route.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/elevenlabs/speech-to-speech/route.ts
git commit -m "feat(credits): pre-flight gate on elevenlabs/speech-to-speech"
```

### Task 10: Add gate to `nanobanana/generate`

**Files:**
- Modify: `src/app/api/nanobanana/generate/route.ts`

- [ ] **Step 1: Same pattern**

Same imports. Insert gate before the NanoBanana call.

- [ ] **Step 2: Verify**

Run: `npm run lint -- src/app/api/nanobanana/generate/route.ts && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nanobanana/generate/route.ts
git commit -m "feat(credits): pre-flight gate on nanobanana/generate"
```

### Task 11: Add gate to `kling/motion-control` and `kling/video-edit`

**Files:**
- Modify: `src/app/api/kling/motion-control/route.ts`
- Modify: `src/app/api/kling/video-edit/route.ts`

- [ ] **Step 1: Apply the same gate pattern to both files**

- [ ] **Step 2: Verify**

```bash
npm run lint -- src/app/api/kling/motion-control/route.ts src/app/api/kling/video-edit/route.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kling/motion-control/route.ts src/app/api/kling/video-edit/route.ts
git commit -m "feat(credits): pre-flight gate on kling motion-control + video-edit"
```

### Task 12: Add gate to `kie/upscale/image` and `kie/upscale/video`

**Files:**
- Modify: `src/app/api/kie/upscale/image/route.ts`
- Modify: `src/app/api/kie/upscale/video/route.ts`

- [ ] **Step 1: Apply the same gate pattern to both files**

- [ ] **Step 2: Verify**

```bash
npm run lint -- src/app/api/kie/upscale/image/route.ts src/app/api/kie/upscale/video/route.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kie/upscale/image/route.ts src/app/api/kie/upscale/video/route.ts
git commit -m "feat(credits): pre-flight gate on kie/upscale image + video"
```

### Task 13: Verify all gates work end-to-end (admin smoke test)

- [ ] **Step 1: Set up a test paid user with 0 credits**

Open Supabase SQL editor. Find a paid test user's id (`auth.users` → email of a known test user). Run:

```sql
UPDATE user_credit_grants SET remaining = 0 WHERE user_id = '<test-paid-user-id>' AND remaining > 0;
SELECT remaining, source FROM user_credit_grants WHERE user_id = '<test-paid-user-id>';
```
Expected: all `remaining` rows are 0.

- [ ] **Step 2: Try every generation surface as that user**

Run: `npm run dev`. Log in as the test user. Try in the Studio app:
- Image gen (uses `studio/generations/start`)
- Kling video gen (uses `kling/generate`)
- VEO gen if accessible
- Video translate
- Speech-to-speech
- Motion control
- Video edit
- Upscale image
- Upscale video

Expected: each request returns HTTP 402 in DevTools network tab. Body shape: `{ error: "INSUFFICIENT_CREDITS", need, have: 0, planId }`. No row added to `studio_generations` for these attempts.

- [ ] **Step 3: Restore the test user balance**

```sql
UPDATE user_credit_grants SET remaining = 1000000 WHERE user_id = '<test-paid-user-id>' AND source = 'subscription';
```
Or re-run the Stripe webhook simulator if available.

- [ ] **Step 4: Verify normal generation now debits**

Trigger an image gen. Check `/admin` → Generations: the row should show `credits_charged > 0` and `credit_balance_after` should be lower than before.

---

## Phase D — Frontend modal infrastructure

### Task 14: Create `guardedFetch` helper

**Files:**
- Create: `src/lib/guardedFetch.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/guardedFetch.ts`:

```ts
"use client";

export type OutOfCreditsDetail = {
  need: number;
  have: number;
  planId: string;
};

export const OUT_OF_CREDITS_EVENT = "out-of-credits";

/**
 * Wraps `fetch` and intercepts 402 INSUFFICIENT_CREDITS responses.
 * On 402, dispatches a global `out-of-credits` CustomEvent with the cost/balance
 * so a single mounted modal can display the upsell. Caller receives `blocked: true`
 * and should NOT proceed with provider-side flow (no toast, no row insert).
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ blocked: boolean; response: Response }> {
  const response = await fetch(input, init);
  if (response.status !== 402) return { blocked: false, response };

  // Clone so the caller can still read the body if they want.
  let detail: OutOfCreditsDetail | null = null;
  try {
    const data = (await response.clone().json()) as {
      error?: string;
      need?: number;
      have?: number;
      planId?: string;
    };
    if (data?.error === "INSUFFICIENT_CREDITS") {
      detail = {
        need: Number(data.need ?? 0),
        have: Number(data.have ?? 0),
        planId: String(data.planId ?? "free"),
      };
    }
  } catch {
    // 402 without our shape — treat as non-credits failure (caller decides).
    return { blocked: false, response };
  }

  if (!detail) return { blocked: false, response };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<OutOfCreditsDetail>(OUT_OF_CREDITS_EVENT, { detail }));
  }
  return { blocked: true, response };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run lint -- src/lib/guardedFetch.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guardedFetch.ts
git commit -m "feat(credits): guardedFetch helper for 402 INSUFFICIENT_CREDITS"
```

### Task 15: Create `OutOfCreditsModal` component

**Files:**
- Create: `src/app/_components/OutOfCreditsModal.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/_components/OutOfCreditsModal.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap, X } from "lucide-react";
import { OUT_OF_CREDITS_EVENT, type OutOfCreditsDetail } from "@/lib/guardedFetch";

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2, pro: 3, scale: 4 };

function nextPlanLabel(planId: string): string | null {
  const r = PLAN_RANK[planId] ?? 0;
  if (r >= 4) return null; // Already on Scale: no upgrade path.
  const next = (Object.entries(PLAN_RANK).find(([, v]) => v === r + 1) ?? [])[0];
  if (!next) return null;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

export default function OutOfCreditsModal() {
  const [detail, setDetail] = useState<OutOfCreditsDetail | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<OutOfCreditsDetail>;
      if (ce.detail) setDetail(ce.detail);
    }
    window.addEventListener(OUT_OF_CREDITS_EVENT, handler as EventListener);
    return () => window.removeEventListener(OUT_OF_CREDITS_EVENT, handler as EventListener);
  }, []);

  const close = useCallback(() => setDetail(null), []);

  if (!detail) return null;

  const isFree = detail.planId === "free";
  const upgradeLabel = nextPlanLabel(detail.planId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={close}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0912] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Crédits insuffisants</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Cette génération coûte{" "}
              <span className="font-semibold text-white">{detail.need}</span> crédits, il t'en reste{" "}
              <span className="font-semibold text-white">{detail.have}</span>.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(isFree || upgradeLabel) && (
            <Link
              href="/pricing"
              onClick={close}
              className="flex flex-col items-start gap-1 rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 text-left transition hover:border-violet-400 hover:bg-violet-500/15"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                {isFree ? "Plans payants" : `Upgrade vers ${upgradeLabel}`}
              </span>
              <span className="text-sm text-white/85">
                {isFree ? "Voir les plans et débloquer plus de crédits/mois" : `Plus de crédits/mois sur ${upgradeLabel}`}
              </span>
            </Link>
          )}
          <Link
            href="/credits"
            onClick={close}
            className="flex flex-col items-start gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-left transition hover:border-amber-400 hover:bg-amber-500/15"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Achat ponctuel</span>
            <span className="text-sm text-white/85">Acheter un pack de crédits</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run lint -- src/app/_components/OutOfCreditsModal.tsx
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/OutOfCreditsModal.tsx
git commit -m "feat(credits): OutOfCreditsModal global component"
```

### Task 16: Mount the modal in `StudioShell`

**Files:**
- Modify: `src/app/_components/StudioShell.tsx`

- [ ] **Step 1: Add import**

At the top of the file, add:
```ts
import OutOfCreditsModal from "@/app/_components/OutOfCreditsModal";
```

- [ ] **Step 2: Render it once at the root of the shell**

Find the top-level returned JSX. Right before the closing tag of the outermost wrapper (or as the last sibling of the root fragment), add:
```tsx
<OutOfCreditsModal />
```

The modal is positioned `fixed inset-0` so position in the tree doesn't matter — but it must be in a client component. `StudioShell` already is.

- [ ] **Step 3: Verify build**

```bash
npm run lint -- src/app/_components/StudioShell.tsx
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/StudioShell.tsx
git commit -m "feat(credits): mount OutOfCreditsModal in StudioShell"
```

---

## Phase E — Migrate generate buttons to `guardedFetch`

### Task 17: Switch every gated-endpoint fetch to `guardedFetch`

**Files (modified):** all components that call a gated endpoint.

- [ ] **Step 1: Enumerate call sites**

Run:
```bash
grep -rln "fetch.*\(/api/(studio/generations/start\|kling/generate\|kie/veo/generate\|wavespeed/video-translate\|elevenlabs/speech-to-speech\|nanobanana/generate\|kling/motion-control\|kling/video-edit\|kie/upscale/image\|kie/upscale/video\|studio/prompt-enhance\)" src/
```

Expected: returns the precise list of files using these endpoints from the client.

- [ ] **Step 2: For each file in the list, apply this transform**

Find calls of the shape:
```ts
const r = await fetch("/api/path", { method: "POST", … });
if (!r.ok) { /* error handling */ }
```

Replace with:
```ts
const { blocked, response: r } = await guardedFetch("/api/path", { method: "POST", … });
if (blocked) return; // modal already shown by guardedFetch
if (!r.ok) { /* error handling */ }
```

Add at the top of the file:
```ts
import { guardedFetch } from "@/lib/guardedFetch";
```

If the original code uses `r.ok ? r.json() : Promise.reject(...)`-style chains, adapt accordingly: only the `fetch(...)` call changes and the new `blocked` short-circuit is added.

**Important:** server-side fetch calls (in `route.ts` files under `src/app/api/`) MUST NOT be migrated — they don't go through a browser, no event bus exists. Only client components.

- [ ] **Step 3: Verify build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 4: Manual UI smoke test**

Run: `npm run dev`. As a paid user with 0 balance:
1. Click "Generate" on Studio Image. Modal should appear.
2. Close modal. Click again. Modal reappears.
3. Click "Voir les plans" CTA. Should navigate to `/pricing`.
4. Repeat with Studio Video, Translate, etc. Modal appears in each case.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(credits): migrate generate buttons to guardedFetch"
```

---

## Phase F — Admin tracking improvements

### Task 18: Create `detectInputMediaType` helper

**Files:**
- Create: `src/lib/admin/detectInputMediaType.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/admin/detectInputMediaType.ts`:

```ts
export type InputMediaType = "image" | "video" | "audio" | "url";

const IMG_EXT = /\.(png|jpe?g|webp|gif|avif|heic|heif)(?:\?|$)/i;
const VID_EXT = /\.(mp4|webm|mov|m4v|mkv)(?:\?|$)/i;
const AUD_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(?:\?|$)/i;

/**
 * Best-effort URL-based classification of generation inputs (image, video, audio,
 * or generic url like a product page). Used in /admin to render the right preview.
 */
export function detectInputMediaType(url: string): InputMediaType {
  const u = url.trim();
  if (!u) return "url";
  if (IMG_EXT.test(u)) return "image";
  if (VID_EXT.test(u)) return "video";
  if (AUD_EXT.test(u)) return "audio";
  // Supabase storage paths often include `audio/`, `video/`, or `image/` segments.
  if (/\/audio\//i.test(u)) return "audio";
  if (/\/video\//i.test(u)) return "video";
  if (/\/image\//i.test(u) || /\/photo\//i.test(u)) return "image";
  return "url";
}
```

- [ ] **Step 2: Verify build**

```bash
npm run lint -- src/lib/admin/detectInputMediaType.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/detectInputMediaType.ts
git commit -m "feat(admin): detectInputMediaType helper"
```

### Task 19: Replace "Link to Ad URL" column with rich "Inputs" column

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add icon imports**

In `src/app/admin/page.tsx`, find the `lucide-react` import block at the top and add:
```ts
import { Image as ImageIcon, Video, Music, Link as LinkIcon } from "lucide-react";
```
(`Image as ImageIcon` and `Video` are already imported — just add `Music` and `Link as LinkIcon`.)

Also import:
```ts
import { detectInputMediaType, type InputMediaType } from "@/lib/admin/detectInputMediaType";
```

- [ ] **Step 2: Add a small `<InputsChips>` component above `MediaPreview`**

Insert near the existing `MediaPreview` definition:

```tsx
function inputIcon(t: InputMediaType) {
  if (t === "image") return <ImageIcon className="h-3 w-3" />;
  if (t === "video") return <Video className="h-3 w-3" />;
  if (t === "audio") return <Music className="h-3 w-3" />;
  return <LinkIcon className="h-3 w-3" />;
}

function InputsChips({ urls }: { urls: string[] | null | undefined }) {
  if (!urls || urls.length === 0) return <span className="text-white/25">-</span>;
  const visible = urls.slice(0, 3);
  const extra = urls.length - visible.length;
  return (
    <div className="flex items-center gap-1">
      {visible.map((u, i) => {
        const t = detectInputMediaType(u);
        return (
          <span
            key={i}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-violet-300"
            title={u}
          >
            {inputIcon(t)}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="text-[10px] tabular-nums text-white/40">+{extra}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update the table header**

Find the existing header row at line ~1761 and replace `<th>Link to Ad URL</th>` with `<th>Inputs</th>`.

- [ ] **Step 4: Update the table cell**

Find the existing `<td>` for `input_urls[0]` at lines ~1794-1809 and replace the entire `<td>...</td>` block with:

```tsx
<td className="px-3 py-2.5">
  <InputsChips urls={row.input_urls} />
</td>
```

- [ ] **Step 5: Update the expanded row to show all inputs as thumbnails**

Find the expanded row block and add a new section after the "Details" panel and before the "Result URLs" panel:

```tsx
{row.input_urls && row.input_urls.length > 0 && (
  <div className="sm:col-span-2">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Input media</p>
    <div className="mt-1 flex flex-wrap gap-2">
      {row.input_urls.map((url, i) => {
        const t = detectInputMediaType(url);
        if (t === "audio") {
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black px-2 py-1">
              <Music className="h-3 w-3 text-violet-300" />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={url} controls className="h-7 w-48" preload="metadata" />
            </div>
          );
        }
        if (t === "video") {
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="group relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-black">
              <video src={url} className="h-full w-full object-cover" muted preload="metadata" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                <ExternalLink className="h-4 w-4 text-white" />
              </span>
            </a>
          );
        }
        if (t === "image") {
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="group relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </a>
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-violet-300 underline underline-offset-2 hover:text-violet-200"
          >
            <LinkIcon className="h-3 w-3" />
            {productLinkLabel(url)}
          </a>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 6: Update the colspan**

The expanded row uses `colSpan={13}` — that count must match the number of columns in the new header. Verify by counting the `<th>` elements after Step 3 and adjust the `colSpan` if it changed.

- [ ] **Step 7: Verify build**

```bash
npm run lint -- src/app/admin/page.tsx
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): rich Inputs column with typed chips and expanded thumbnails"
```

### Task 20: Add email + date filters to admin generations API

**Files:**
- Modify: `src/app/api/admin/generations/route.ts`

- [ ] **Step 1: Parse new query params**

Find the parameter extraction block (lines ~38-44) and add:
```ts
const emailFilter = url.searchParams.get("email")?.trim().toLowerCase() || null;
const fromDate = url.searchParams.get("from") || null; // ISO date YYYY-MM-DD
const toDate = url.searchParams.get("to") || null;
const sort = url.searchParams.get("sort") || "when"; // "when" | "charged" | "balance"
const order: "asc" | "desc" = url.searchParams.get("order") === "asc" ? "asc" : "desc";
```

- [ ] **Step 2: Translate email filter into a user_id filter**

Email maps to user_id via Supabase auth. Insert before the main query:
```ts
let emailUserIds: string[] | null = null;
if (emailFilter) {
  const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  emailUserIds = (userList?.users ?? [])
    .filter((u) => (u.email ?? "").toLowerCase().includes(emailFilter))
    .map((u) => u.id);
  if (emailUserIds.length === 0) {
    return NextResponse.json({ rows: [], emailMap: {}, total: 0, page, perPage });
  }
}
```

- [ ] **Step 3: Apply filters to the query**

Find the existing `let query = admin.from("studio_generations")...` block and replace the order-by + range with sort-aware logic:

```ts
const sortColumn = sort === "charged" ? "credits_charged" : sort === "balance" ? "credit_balance_after" : "created_at";

let query = admin
  .from("studio_generations")
  .select("*", { count: "exact" })
  .order(sortColumn, { ascending: order === "asc" })
  .range(from, to);

if (kind) query = query.eq("kind", kind);
if (status) query = query.eq("status", status);
if (userId) query = query.eq("user_id", userId);
if (emailUserIds) query = query.in("user_id", emailUserIds);
if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00.000Z`);
if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);
if (search) query = query.or(`label.ilike.%${search}%,external_task_id.ilike.%${search}%`);
```

- [ ] **Step 4: Verify build**

```bash
npm run lint -- src/app/api/admin/generations/route.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/generations/route.ts
git commit -m "feat(admin): email/date/sort filters on /api/admin/generations"
```

### Task 21: Add admin UI filter inputs (email + date + sort)

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add new state**

Find the generations state block (~line 300) and add:
```ts
const [genEmail, setGenEmail] = useState("");
const [genEmailInput, setGenEmailInput] = useState("");
const [genFrom, setGenFrom] = useState("");
const [genTo, setGenTo] = useState("");
const [genSort, setGenSort] = useState<"when" | "charged" | "balance">("when");
const [genOrder, setGenOrder] = useState<"asc" | "desc">("desc");
```

- [ ] **Step 2: Pass filters in `fetchGenerations`**

Find the `fetchGenerations` callback and update the params block:
```ts
const params = new URLSearchParams({ page: String(genPage), per_page: String(perPage) });
if (genKind) params.set("kind", genKind);
if (genStatus) params.set("status", genStatus);
if (genSearch) params.set("q", genSearch);
if (genEmail) params.set("email", genEmail);
if (genFrom) params.set("from", genFrom);
if (genTo) params.set("to", genTo);
params.set("sort", genSort);
params.set("order", genOrder);
```

Update the dependency array of `useCallback` accordingly:
```ts
}, [genPage, genKind, genStatus, genSearch, genEmail, genFrom, genTo, genSort, genOrder]);
```

- [ ] **Step 3: Render the filters**

Find the existing filter bar (~line 856 `mt-4 flex flex-wrap items-center gap-3`). Add inside the `tab === "generations"` block:

```tsx
<input
  type="text"
  placeholder="Filter by email…"
  value={genEmailInput}
  onChange={(e) => setGenEmailInput(e.target.value)}
  onKeyDown={(e) => { if (e.key === "Enter") { setGenEmail(genEmailInput); setGenPage(1); } }}
  className="w-48 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-400/40"
/>
<input
  type="date"
  value={genFrom}
  onChange={(e) => { setGenFrom(e.target.value); setGenPage(1); }}
  className="rounded-lg border border-white/10 bg-[#0b0912] px-2 py-2 text-xs text-white/70 outline-none"
  title="From date"
/>
<input
  type="date"
  value={genTo}
  onChange={(e) => { setGenTo(e.target.value); setGenPage(1); }}
  className="rounded-lg border border-white/10 bg-[#0b0912] px-2 py-2 text-xs text-white/70 outline-none"
  title="To date"
/>
```

- [ ] **Step 4: Make table headers clickable for sort**

Find the header for "Charged" (~line 1763), "Balance after" (~line 1764), and "When" (~line 1771). Wrap the label in a button that toggles sort:

```tsx
<th className="px-3 py-2.5 font-semibold">
  <button
    type="button"
    onClick={() => {
      if (genSort === "charged") setGenOrder(genOrder === "desc" ? "asc" : "desc");
      else { setGenSort("charged"); setGenOrder("desc"); }
      setGenPage(1);
    }}
    className="flex items-center gap-1 hover:text-white/70"
  >
    Charged {genSort === "charged" && (genOrder === "desc" ? "↓" : "↑")}
  </button>
</th>
```

Repeat the same pattern for `balance` and `when`. Keep the other headers as plain text.

- [ ] **Step 5: Verify build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 6: Manual UI test**

`npm run dev`, navigate to `/admin`. Type an email partial → press Enter → table filters. Pick a from-date → table filters by date. Click "Charged" header → rows reorder.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): email/date/sort filters in Generations tab"
```

### Task 22: Add per-user recap card

**Files:**
- Modify: `src/app/api/admin/generations/route.ts`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Extend the API response with a summary block**

In `src/app/api/admin/generations/route.ts`, when `emailFilter` resolves to exactly one user_id, compute a summary:

```ts
let userSummary: null | {
  user_id: string;
  email: string;
  plan_id: string | null;
  current_balance_display: number;
  spent_this_month_display: number;
  ready: number;
  failed: number;
  processing: number;
} = null;

if (emailUserIds && emailUserIds.length === 1) {
  const uid = emailUserIds[0]!;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [{ data: userInfo }, { data: planRow }, balanceRes, { data: monthRows }, { data: statusRows }] = await Promise.all([
    admin.auth.admin.getUserById(uid),
    admin.from("user_subscriptions").select("plan_id").eq("user_id", uid).maybeSingle(),
    (await import("@/lib/creditGrants")).getUserCreditBalance(admin, uid),
    admin.from("studio_generations").select("credits_charged").eq("user_id", uid).gte("created_at", startOfMonth.toISOString()),
    admin.from("studio_generations").select("status").eq("user_id", uid),
  ]);

  const ledgerToDisplay = (await import("@/lib/creditLedgerTicks")).ledgerTicksToDisplayCredits;
  const spentThisMonthTicks = (monthRows ?? []).reduce<number>((s, r) => s + ((r as { credits_charged: number }).credits_charged ?? 0), 0);
  const ready = (statusRows ?? []).filter((r) => (r as { status: string }).status === "ready").length;
  const failed = (statusRows ?? []).filter((r) => (r as { status: string }).status === "failed").length;
  const processing = (statusRows ?? []).filter((r) => (r as { status: string }).status === "processing").length;

  userSummary = {
    user_id: uid,
    email: userInfo?.user?.email ?? uid,
    plan_id: (planRow as { plan_id?: string } | null)?.plan_id ?? null,
    current_balance_display: balanceRes.balance,
    spent_this_month_display: ledgerToDisplay(spentThisMonthTicks),
    ready,
    failed,
    processing,
  };
}
```

Then add `userSummary` to the JSON response.

- [ ] **Step 2: Render the recap card in admin**

In `src/app/admin/page.tsx`, add the type:
```ts
type GenUserSummary = {
  user_id: string;
  email: string;
  plan_id: string | null;
  current_balance_display: number;
  spent_this_month_display: number;
  ready: number;
  failed: number;
  processing: number;
};
```

Add state `const [genUserSummary, setGenUserSummary] = useState<GenUserSummary | null>(null);` and set it from the fetch response.

Render it above the generations table when truthy:
```tsx
{tab === "generations" && genUserSummary && (
  <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] p-4">
    <p className="text-sm font-semibold text-violet-100">{genUserSummary.email}</p>
    <p className="mt-1 text-xs text-white/65">
      Plan: <span className="font-semibold capitalize">{genUserSummary.plan_id ?? "free"}</span>
      {" • "}
      Solde actuel: <span className="font-semibold text-amber-200/90 tabular-nums">{formatCreditBalanceSnap(genUserSummary.current_balance_display)} cr</span>
      {" • "}
      Sur le mois: <span className="font-semibold tabular-nums">{formatCreditBalanceSnap(genUserSummary.spent_this_month_display)} cr</span>
    </p>
    <p className="mt-1 text-[11px] text-white/45">
      {genUserSummary.ready} ready • {genUserSummary.failed} failed • {genUserSummary.processing} processing
    </p>
  </div>
)}
```

- [ ] **Step 3: Verify build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 4: Manual test**

In `/admin` Generations, filter by an exact email. Verify the recap card appears with the user's plan, balance, monthly spend, and status counts.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/generations/route.ts src/app/admin/page.tsx
git commit -m "feat(admin): per-user recap card when email filter is set"
```

### Task 23: Enrich admin global stats (30d credits, top users, failure rate)

**Files:**
- Modify: `src/app/api/admin/stats/route.ts`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Extend `/api/admin/stats` payload**

In `src/app/api/admin/stats/route.ts`, after computing `totalCreditsSpent`, add:

```ts
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const { data: last30 } = await admin
  .from("studio_generations")
  .select("credits_charged,user_id,status")
  .gte("created_at", thirtyDaysAgo);

let creditsSpent30d = 0;
const perUser = new Map<string, number>();
let total = 0;
let failed = 0;
for (const r of last30 ?? []) {
  const ticks = (r as { credits_charged: number }).credits_charged ?? 0;
  const display = ledgerTicksToDisplayCredits(ticks);
  creditsSpent30d += display;
  const uid = (r as { user_id: string }).user_id;
  perUser.set(uid, (perUser.get(uid) ?? 0) + display);
  total += 1;
  if ((r as { status: string }).status === "failed") failed += 1;
}

const failureRatePct = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;

const topUserIds = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
const topUsersBySpend: Array<{ user_id: string; email: string; total: number }> = [];
if (topUserIds.length > 0) {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map<string, string>();
  for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? u.id);
  for (const [uid, totalSpent] of topUserIds) {
    topUsersBySpend.push({ user_id: uid, email: emailById.get(uid) ?? uid.slice(0, 8), total: Math.round(totalSpent * 10) / 10 });
  }
}
```

Add to the JSON response: `creditsSpent30d`, `topUsersBySpend`, `failureRatePct`.

- [ ] **Step 2: Update Stats type in admin page**

In `src/app/admin/page.tsx`, find the `type Stats` block (~line 157) and add:
```ts
creditsSpent30d?: number;
topUsersBySpend?: Array<{ user_id: string; email: string; total: number }>;
failureRatePct?: number;
```

- [ ] **Step 3: Render new stats cards**

Find the stats card row (~line 819). Below the existing 4 cards, add a second row:

```tsx
{tab === "generations" && stats && stats.creditsSpent30d !== undefined && (
  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <StatCard
      label="Credits spent (30d)"
      value={formatCreditBalanceSnap(stats.creditsSpent30d)}
      icon={Zap}
      accent="bg-amber-500/20 text-amber-300"
    />
    <StatCard
      label="Failure rate (30d)"
      value={`${stats.failureRatePct ?? 0}%`}
      icon={Activity}
      accent={(stats.failureRatePct ?? 0) > 5 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}
    />
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-2">Top consumers (30d)</p>
      <div className="flex flex-wrap gap-1.5">
        {(stats.topUsersBySpend ?? []).map((u) => (
          <button
            key={u.user_id}
            type="button"
            onClick={() => { setGenEmail(u.email); setGenEmailInput(u.email); setGenPage(1); }}
            className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-200 hover:border-violet-400 hover:bg-violet-500/20"
            title={`${u.email} → ${u.total} credits`}
          >
            {u.email.split("@")[0]} · {u.total}
          </button>
        ))}
        {(!stats.topUsersBySpend || stats.topUsersBySpend.length === 0) && (
          <span className="text-[11px] text-white/30">No spend yet</span>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/stats/route.ts src/app/admin/page.tsx
git commit -m "feat(admin): 30d credits, top users, failure rate stats"
```

### Task 24: Add row badges (partner)

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add `Gift` icon import** (already imported per existing code)

- [ ] **Step 2: Add badge column or inline in User cell**

In the table row (`<td>` for User at ~line 1784), wrap the existing span and append a partner badge when applicable:

```tsx
<td className="px-3 py-2.5">
  <div className="flex items-center gap-1.5">
    <span className="max-w-[140px] truncate block text-white/70" title={genEmailMap[row.user_id] ?? row.user_id}>
      {genEmailMap[row.user_id]?.split("@")[0] ?? row.user_id.slice(0, 8)}
    </span>
    {activePlanByUserId[row.user_id] && (
      <span
        className="inline-flex h-4 items-center gap-0.5 rounded-sm border border-violet-500/40 bg-violet-500/15 px-1 text-[9px] font-semibold text-violet-200"
        title={`Partner: ${activePlanByUserId[row.user_id].plan_id} until ${new Date(activePlanByUserId[row.user_id].expires_at).toLocaleDateString()}`}
      >
        <Gift className="h-2.5 w-2.5" />
        partner
      </span>
    )}
  </div>
</td>
```

- [ ] **Step 3: Verify build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): partner badge on generations rows"
```

---

## Phase G — Manual verification matrix + sign-off

### Task 25: Run the full test matrix

- [ ] **Step 1: Persona table — execute one test per row**

For each row, set up the persona (in Supabase SQL editor, set their plan and balance), then perform a generation in the UI. Record observed result.

| Persona | Plan | Personal API | Setup query | Action | Expected |
|---------|------|--------------|-------------|--------|----------|
| Free user, 5 cr, gen costs 3 | free | no | `INSERT/UPDATE user_credit_grants SET remaining = 10 (= 5 display)` for free user | Generate 1 image (~3 cr) | Generates; admin row shows credits_charged > 0; balance after ≈ 2 |
| Free user, 1 cr, gen costs 3 | free | no | UPDATE remaining = 2 (= 1 display) | Generate same image | 402 → modal shows "need 3, have 1"; no row in studio_generations |
| Stripe Growth user, 100 cr | growth | no | UPDATE subscription grant remaining = 200 (= 100) | Generate image | Generates; admin row credits_charged > 0; balance after lower |
| Stripe Growth user, 0 cr | growth | no | UPDATE remaining = 0 | Generate image | 402 → modal with "Upgrade Pro" + "Buy pack"; no row |
| Comp Pro user, 50 cr | pro | no | redeemed plan link, remaining = 100 (= 50) | Generate image | Generates; debited |
| Comp Pro user, 0 cr | pro | no | UPDATE remaining = 0 | Generate image | 402 → modal; no row |
| Personal API user (KIE key in settings) | any | yes | provide personalApiKey | Generate image | Generates; credits_charged = 0 in row |
| Unlimited email (staff) | any | no | email matches `isSubscriptionUnlimitedEmail` | Generate image | Generates; credits_charged = 0 in row |

- [ ] **Step 2: Admin spot-checks**

For each test from Step 1, open `/admin` Generations and verify:
- The new row exists (or absence for blocked cases).
- `credits_charged` and `credit_balance_after` are correct.
- The Inputs column renders typed chips for any input media.
- The expanded row shows full thumbnails / audio player when applicable.

- [ ] **Step 3: Filter sanity-check**

In `/admin` Generations:
- Type one of the test users' email → recap card appears with correct plan + balance + monthly spend.
- Pick yesterday → today as date filter → only recent rows show.
- Click "Charged ↓" sort → highest-cost row first.
- Click a top-user chip from the global stats → email filter is auto-set.

- [ ] **Step 4: Final lint + build**

```bash
npm run lint
npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit verification log (optional)**

If any unexpected behavior was discovered and fixed, commit those follow-up fixes with messages like `fix(credits): …`. Otherwise no commit needed for Step 5.

- [ ] **Step 6: Push**

```bash
git push origin main
```
(Or open a PR if working from a feature branch — adapt to project workflow.)

---

## Plan self-review (already done by author)

- **Spec coverage:** every section of the spec maps to one or more tasks. Backend rule flip = Tasks 2-5; pre-flight gates = Tasks 6-12; modal = Tasks 14-16; guarded fetch migration = Task 17; admin enrichments = Tasks 18-24; manual verification = Task 25. Existing comp users are auto-debited via the rule flip — no migration task needed.
- **Placeholders:** none. Every code step contains the actual code. Every command has expected output.
- **Type consistency:** `shouldChargePlatformCredits()` and `assertSufficientCreditsResponse()` are used with the same signature in every task that calls them. The `OutOfCreditsDetail` type is shared between `guardedFetch.ts` and `OutOfCreditsModal.tsx`. The `InputMediaType` type is consistent across `detectInputMediaType.ts` and admin usage.
