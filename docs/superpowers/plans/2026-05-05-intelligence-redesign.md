# Intelligence Dashboard v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `/intelligence` inside the Youry `StudioShell`, polish all 4 content blocks, and harden the TrendTrack integration with typed errors, a credits indicator, multi-result search, and a "pinned brands" affordance — without expanding scope into pipeline injection.

**Architecture:** This is a frontend-heavy redesign of an existing feature. We touch (a) `StudioShell` + `studioPaths` to make `/intelligence` a first-class section, (b) `lib/trendtrack.ts` for a typed-error class, (c) all `app/api/intelligence/**/route.ts` for structured error forwarding + stale-cache fallback, (d) every `app/intelligence/_components/*.tsx` for visual + interaction polish, and (e) two new endpoints (`/api/intelligence/usage`, `/api/intelligence/pinned`) plus one new Supabase table.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind v4, Supabase (`@supabase/ssr`), Anthropic SDK, lucide-react icons, `framer-motion` (already a dep — used sparingly for the modal). No test framework — verification = `npm run lint` + `npm run build` + manual smoke on `npm run dev`.

**Verification contract per task:**
- After every code change, `npm run lint` must pass.
- After every commit that touches a server route or shared lib, `npm run build` must pass (catches type errors that lint misses).
- Manual smoke instructions are explicit on tasks that change visible UI.

**Spec reference:** `docs/superpowers/specs/2026-05-05-intelligence-redesign-design.md`.

---

## Phase A — Studio Shell integration (foundation)

### Task A1: Add `intelligence` to studio path maps

**Files:**
- Modify: `src/lib/studioPaths.ts`

- [ ] **Step 1: Add `intelligence` to `AppSection` and `SECTION_TO_SLUG`**

In `src/lib/studioPaths.ts`, change the `AppSection` union:

```ts
export type AppSection =
  | "link_to_ad"
  | "ads_studio"
  | "avatar"
  | "ad_clone"
  | "voice"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "intelligence"
  | "projects";
```

And the `SECTION_TO_SLUG` map (preserve key order — `intelligence` before `projects`):

```ts
export const SECTION_TO_SLUG: Record<AppSection, string> = {
  link_to_ad: "link-to-ad",
  ads_studio: "ads-studio",
  avatar: "avatar",
  ad_clone: "translate",
  voice: "voice",
  motion_control: "motion-control",
  image: "image",
  video: "video",
  upscale: "upscale",
  intelligence: "intelligence",
  projects: "my-projects",
};
```

`isStudioShellPath`, `isStudioToolPath`, `sectionFromPathname`, `sectionToPath` all derive from these maps so they pick up `intelligence` automatically — no further edits needed in this file.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/studioPaths.ts
git commit -m "feat(intelligence): register intelligence as a studio section"
```

---

### Task A2: Promote `Intelligence` to a real CREATE nav entry (Beta, not Soon)

**Files:**
- Modify: `src/app/_components/StudioShell.tsx`

- [ ] **Step 1: Add `intelligence` to the `StudioNavSection` union and slug map**

`StudioShell.tsx` keeps a *local* mirror of the section types (`StudioShell.tsx:44-67`). Update both:

```ts
export type StudioNavSection =
  | "link_to_ad"
  | "ads_studio"
  | "avatar"
  | "ad_clone"
  | "voice"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "intelligence"
  | "projects";

const SECTION_TO_SLUG: Record<StudioNavSection, string> = {
  link_to_ad: "link-to-ad",
  ads_studio: "ads-studio",
  avatar: "avatar",
  ad_clone: "translate",
  voice: "voice",
  motion_control: "motion-control",
  image: "image",
  video: "video",
  upscale: "upscale",
  intelligence: "intelligence",
  projects: "my-projects",
};
```

- [ ] **Step 2: Import `Telescope` and replace the `intelligence` "Soon" entry with a `route` entry**

Update the lucide import block (`StudioShell.tsx:9-26`) to include `Telescope`:

```ts
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  Link2,
  Lock,
  Maximize2,
  Menu,
  Mic,
  Sparkles,
  Telescope,
  UserRound,
  Video,
  Joystick,
  Languages,
  X,
} from "lucide-react";
```

Then in `CREATE_NAV` (`StudioShell.tsx:105-130`), replace the existing `intelligence` "Soon" custom-link (added in commit `30645ab9`) with a real route entry placed right before `Avatar`:

```ts
const CREATE_NAV: CreateNavEntry[] = [
  { kind: "route", id: "link_to_ad", label: "Link to Ad", icon: Link2 },
  {
    kind: "custom-link",
    id: "ads_studio",
    href: "/ads-studio",
    label: "Ads Studio",
    icon: Sparkles,
    soon: true,
  },
  {
    kind: "custom-link",
    id: "workflow",
    href: "/workflow",
    label: "Workflow",
    icon: GitBranch,
  },
  { kind: "route", id: "intelligence", label: "Intelligence", icon: Telescope },
  { kind: "route", id: "avatar", label: "Avatar", icon: UserRound },
  { kind: "route", id: "ad_clone", label: "Translate", icon: Languages },
  { kind: "route", id: "voice", label: "Voice", icon: Mic },
  { kind: "route", id: "motion_control", label: "Motion Control", icon: Joystick },
  { kind: "route", id: "image", label: "Image", icon: ImageIcon },
  { kind: "route", id: "video", label: "Video", icon: Video },
  { kind: "route", id: "upscale", label: "Upscale", icon: Maximize2 },
];
```

If the existing intelligence custom-link in this file uses different fields (e.g. `beta: true`), keep only the `route` entry above and delete the old custom-link entirely. Search the file for `intelligence` to confirm there is only one entry left after the edit.

There is currently no `beta` rendering for `kind: "route"` entries. We don't need a Beta pill in the rail itself — the page header inside `/intelligence` will carry the Beta badge instead. Skip wiring a `beta` field on route entries.

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: both pass. The `build` step is mandatory because `StudioNavSection` is widely consumed and a typo cascades.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`, log in, look at the CREATE rail. Expected: `Intelligence` row appears between `Workflow` and `Avatar` with the Telescope icon. Hover state matches the other items. Clicking it navigates to `/intelligence` (still standalone for now — we wrap in next task).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/StudioShell.tsx
git commit -m "feat(intelligence): promote Intelligence to first-class CREATE nav entry"
```

---

### Task A3: Wrap `/intelligence` in `StudioShell` and drop the page's own dark shell

**Files:**
- Modify: `src/app/intelligence/page.tsx`
- Modify: `src/app/intelligence/_components/IntelligenceClient.tsx`

- [ ] **Step 1: Wrap the page output with `StudioShell`**

Replace the body of `src/app/intelligence/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ttListTrackers } from "@/lib/trendtrack";
import { getCached } from "@/lib/trendtrackCache";
import type { TTTracker } from "@/lib/trendtrack";
import StudioShell from "@/app/_components/StudioShell";
import { IntelligenceClient } from "./_components/IntelligenceClient";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  let ownTrackerIds: string[] = [];
  try {
    const cached = await getCached<TTTracker[]>("trackers:list");
    const trackers = cached ?? (await ttListTrackers());
    ownTrackerIds = trackers.map((t) => t.id);
  } catch {
    // non-fatal
  }

  return (
    <StudioShell>
      <IntelligenceClient ownTrackerIds={ownTrackerIds} />
    </StudioShell>
  );
}
```

- [ ] **Step 2: Strip the standalone dark wrapper inside `IntelligenceClient`**

`StudioShell` already provides `dark min-h-screen bg-[#050507] text-white` and the violet glow blob. The `IntelligenceClient` should now render as a *content* component flush against the rail, with its own internal sub-sidebar.

Replace the outer `<div className="flex h-screen bg-[#0a0a0f] text-white">` and its children in `src/app/intelligence/_components/IntelligenceClient.tsx` with this layout (full file rewrite — keep the existing imports and `useCallback` logic):

```tsx
"use client";

import { useCallback, useState } from "react";
import type { TTLookupResult } from "@/lib/trendtrack";
import { TrackerSearch } from "./TrackerSearch";
import { TrackerList, type SelectedTracker } from "./TrackerList";
import { TrackerDetail } from "./TrackerDetail";

export function IntelligenceClient({ ownTrackerIds }: { ownTrackerIds: string[] }) {
  const [selected, setSelected] = useState<SelectedTracker | null>(null);
  const [searchResult, setSearchResult] = useState<TTLookupResult | null>(null);

  const handleSearchResult = useCallback((result: TTLookupResult | null) => {
    setSearchResult(result);
    if (result) {
      setSelected({
        id: result.id,
        name: result.name,
        logo: result.logo ?? result.logoUrl,
        sourceType: result.type === "brandtracker" ? "tracker" : "search",
      });
    }
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-0px)]">
      <aside className="sticky top-0 flex h-dvh w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-[#06070d] p-4">
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
            <h1 className="text-sm font-semibold text-white/85">Intelligence</h1>
          </div>
          <span className="rounded-md border border-violet-300/35 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-100">
            Beta
          </span>
        </div>
        <TrackerSearch onResult={handleSearchResult} />
        <div className="flex min-h-0 flex-col gap-1">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
            Trackers
          </p>
          <TrackerList
            selectedId={selected?.id}
            onSelect={setSelected}
            searchResult={searchResult}
          />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIds} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <div className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.9)]" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-white/80">Pick a tracker or search a brand</p>
          <p className="text-xs text-white/40">
            Search by name or domain to look up any advertiser. Save the ones you want to revisit.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`, navigate to `/intelligence`. Expected:
- The Youry rail is visible on the left (CREATE list, Intelligence row highlighted).
- The trackers sub-sidebar is at 320px width with a darker background.
- Empty-state copy reads "Pick a tracker or search a brand" with a Beta badge near the title.
- Select a tracker — detail loads on the right with the existing 5 blocks.

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/page.tsx src/app/intelligence/_components/IntelligenceClient.tsx
git commit -m "feat(intelligence): wrap page in StudioShell and re-skin sub-sidebar"
```

---

## Phase B — Typed TrendTrack errors + stale-cache fallback

### Task B1: `TrendTrackError` class and structured `ttFetch`

**Files:**
- Modify: `src/lib/trendtrack.ts`

- [ ] **Step 1: Define and export `TrendTrackError`**

Insert near the top of `src/lib/trendtrack.ts` (after the `BASE` constant):

```ts
export type TrendTrackErrorCode =
  | "auth"
  | "rate_limit"
  | "not_found"
  | "server"
  | "unknown";

export class TrendTrackError extends Error {
  status: number;
  code: TrendTrackErrorCode;
  retryAfterSec?: number;
  raw: string;

  constructor(opts: {
    status: number;
    code: TrendTrackErrorCode;
    retryAfterSec?: number;
    raw: string;
    message: string;
  }) {
    super(opts.message);
    this.name = "TrendTrackError";
    this.status = opts.status;
    this.code = opts.code;
    this.retryAfterSec = opts.retryAfterSec;
    this.raw = opts.raw;
  }
}

function classifyTrendTrackStatus(status: number): TrendTrackErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}
```

- [ ] **Step 2: Replace `ttFetch`'s generic `Error` with `TrendTrackError`**

Replace the `ttFetch` function in `src/lib/trendtrack.ts` with:

```ts
async function ttFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = requireEnv("TRENDTRACK_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfterRaw = res.headers.get("retry-after");
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : undefined;
    throw new TrendTrackError({
      status: res.status,
      code: classifyTrendTrackStatus(res.status),
      retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
      raw: body,
      message: `TrendTrack ${res.status} ${path}: ${body || "(no body)"}`,
    });
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass. (Existing `instanceof Error` checks in routes still work because `TrendTrackError extends Error`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/trendtrack.ts
git commit -m "feat(intelligence): typed TrendTrackError class with code + retryAfter"
```

---

### Task B2: Stale-cache fallback helper

**Files:**
- Modify: `src/lib/trendtrackCache.ts`

- [ ] **Step 1: Add `getStale` function (returns expired cache too)**

Append to `src/lib/trendtrackCache.ts`:

```ts
export type StaleCacheHit<T> = { data: T; staleAt: string; expired: boolean };

export async function getStale<T>(key: string): Promise<StaleCacheHit<T> | null> {
  const sb = createSupabaseServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("intelligence_cache")
    .select("data, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  const expired = new Date(data.expires_at) <= new Date();
  return {
    data: data.data as T,
    staleAt: data.expires_at as string,
    expired,
  };
}
```

`getCached` is unchanged. `getStale` is the one routes call when TrendTrack 5xx's.

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/trendtrackCache.ts
git commit -m "feat(intelligence): getStale helper for 5xx fallback"
```

---

### Task B3: Structured error responses + stale fallback in API routes

**Files:**
- Modify: `src/app/api/intelligence/lookup/route.ts`
- Modify: `src/app/api/intelligence/trackers/route.ts`
- Modify: `src/app/api/intelligence/trackers/[id]/overview/route.ts`
- Modify: `src/app/api/intelligence/trackers/[id]/top-ads/route.ts`
- Modify: `src/app/api/intelligence/ads/query/route.ts`

- [ ] **Step 1: Helper for the response shape**

Create `src/app/api/intelligence/_errors.ts`:

```ts
import { NextResponse } from "next/server";
import { TrendTrackError } from "@/lib/trendtrack";
import { getStale } from "@/lib/trendtrackCache";

export type StructuredError = {
  error: string;
  code: "auth" | "rate_limit" | "not_found" | "server" | "unknown";
  retryAfterSec?: number;
};

export async function respondTrendTrackError<T>(
  err: unknown,
  staleKey: string | null
): Promise<NextResponse> {
  if (err instanceof TrendTrackError) {
    if (err.code === "server" && staleKey) {
      const stale = await getStale<T>(staleKey);
      if (stale) {
        return NextResponse.json(
          { data: stale.data, staleAt: stale.staleAt },
          { status: 200, headers: { "x-intel-stale": "1" } }
        );
      }
    }
    const body: StructuredError = {
      error: err.message,
      code: err.code,
      retryAfterSec: err.retryAfterSec,
    };
    return NextResponse.json(body, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json(
    { error: message, code: "unknown" } satisfies StructuredError,
    { status: 502 }
  );
}
```

The stale shape `{ data, staleAt }` is deliberately different from the success shape so the client can detect it. `top-ads` and the other array-returning endpoints will need a small client-side check (handled in Task B4).

- [ ] **Step 2: Use the helper in `lookup/route.ts`**

Replace the `catch` block in `src/app/api/intelligence/lookup/route.ts`:

```ts
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
// …
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
```

(Replace the existing `const msg = …; return NextResponse.json({ error: msg }, { status: 502 });`.)

- [ ] **Step 3: Same in `trackers/route.ts`**

In `src/app/api/intelligence/trackers/route.ts`, find the `catch (err)` block and use:

```ts
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
// …
  } catch (err) {
    return respondTrendTrackError(err, "trackers:list");
  }
```

- [ ] **Step 4: Same in `trackers/[id]/overview/route.ts`**

```ts
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
// inside the catch:
    return respondTrendTrackError(err, `tracker:${id}:overview`);
```

- [ ] **Step 5: Same in `trackers/[id]/top-ads/route.ts`**

```ts
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
// inside the catch:
    return respondTrendTrackError(err, `tracker:${id}:top-ads`);
```

- [ ] **Step 6: Same in `ads/query/route.ts`**

```ts
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
// inside the catch — pass null for staleKey because ads/query is keyed by hash and stale data
// for arbitrary search bodies isn't useful UX:
    return respondTrendTrackError(err, null);
```

If you find the route currently computes a `key` variable for caching, prefer passing that key here so stale fallback works. Match the cache key used when `setCached` is called in the same route.

- [ ] **Step 7: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass. The `respondTrendTrackError` is generic so each call site is fine.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/intelligence
git commit -m "feat(intelligence): structured TrendTrack error responses with stale fallback"
```

---

### Task B4: Client-side error mapping in `TrackerDetail`

**Files:**
- Modify: `src/app/intelligence/_components/TrackerDetail.tsx`

- [ ] **Step 1: Add a typed error parser**

Above the component definition in `TrackerDetail.tsx`, add:

```ts
type IntelError =
  | { code: "auth"; message: string }
  | { code: "rate_limit"; message: string; retryAfterSec?: number }
  | { code: "not_found"; message: string }
  | { code: "server"; message: string }
  | { code: "unknown"; message: string };

async function parseIntelResponse<T>(res: Response): Promise<
  | { ok: true; data: T; staleAt?: string }
  | { ok: false; error: IntelError }
> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = (body.code as IntelError["code"]) ?? "unknown";
    return {
      ok: false,
      error: {
        code,
        message: (body.error as string) ?? `HTTP ${res.status}`,
        ...(typeof body.retryAfterSec === "number"
          ? { retryAfterSec: body.retryAfterSec as number }
          : {}),
      } as IntelError,
    };
  }
  if (body && typeof body === "object" && "staleAt" in body && "data" in body) {
    return { ok: true, data: body.data as T, staleAt: body.staleAt as string };
  }
  return { ok: true, data: body as unknown as T };
}

function intelErrorMessage(e: IntelError): string {
  switch (e.code) {
    case "auth":
      return "TrendTrack key invalid. Contact admin.";
    case "rate_limit":
      return e.retryAfterSec
        ? `Rate-limited. Retry in ${e.retryAfterSec}s.`
        : "Rate-limited. Try again shortly.";
    case "not_found":
      return "No data on TrendTrack for this brand.";
    case "server":
      return "TrendTrack momentarily unavailable.";
    default:
      return e.message || "Network error";
  }
}
```

- [ ] **Step 2: Replace each `fetch` block to use `parseIntelResponse`**

For `fetchOverview`, `fetchAds`, `fetchAngles`, `fetchOpportunities` in `TrackerDetail.tsx`, replace the existing body shape with the helper. Example for `fetchOverview` (apply the same pattern to the other three):

```ts
const fetchOverview = useCallback(
  async (force = false) => {
    if (!isOwnTracker) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch(
        `/api/intelligence/trackers/${tracker.id}/overview${force ? "?force=true" : ""}`
      );
      const parsed = await parseIntelResponse<TTOverview>(res);
      if (!parsed.ok) {
        setOverviewError(intelErrorMessage(parsed.error));
        return;
      }
      setOverview(parsed.data);
      // staleAt could be exposed up to a hero badge — wired in Task D2.
    } catch {
      setOverviewError("Network error");
    } finally {
      setOverviewLoading(false);
    }
  },
  [tracker.id, isOwnTracker]
);
```

For `fetchAds` keep the POST/GET branching; only the response-parsing line changes.

For `fetchOpportunities` keep the special `res.status === 202` branch (it's a control message, not an error) — call `parseIntelResponse` only when status is not 202.

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

Run `npm run dev` and pick any tracker. Expected: blocks still load with the same data. To smoke an error path: temporarily set `TRENDTRACK_API_KEY=bad` in `.env.local`, restart dev, hit `/intelligence`, click a tracker. Expected: each block shows "TrendTrack key invalid. Contact admin." Restore the real key after.

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/_components/TrackerDetail.tsx
git commit -m "feat(intelligence): typed error mapping in tracker detail blocks"
```

---

## Phase C — Multi-result search dropdown

### Task C1: `SearchDropdown` component

**Files:**
- Create: `src/app/intelligence/_components/SearchDropdown.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/intelligence/_components/SearchDropdown.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { TTLookupResult } from "@/lib/trendtrack";

type Props = {
  results: TTLookupResult[];
  highlightedIndex: number;
  onHighlight: (i: number) => void;
  onPick: (r: TTLookupResult) => void;
  onClose: () => void;
  emptyQuery: string | null;
};

export function SearchDropdown({
  results,
  highlightedIndex,
  onHighlight,
  onPick,
  onClose,
  emptyQuery,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  if (results.length === 0 && !emptyQuery) return null;

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0912]/95 p-1 shadow-xl backdrop-blur"
      role="listbox"
    >
      {results.length === 0 && emptyQuery ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-white/55">
          <span>No brand found for &quot;{emptyQuery}&quot;.</span>
          <span className="text-white/35">Try a domain (e.g. nike.com).</span>
        </div>
      ) : (
        results.map((r, i) => {
          const logo = r.logo ?? r.logoUrl;
          const isOwn = r.type === "brandtracker";
          return (
            <button
              key={`${r.type}:${r.id}`}
              role="option"
              aria-selected={i === highlightedIndex}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => onPick(r)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                i === highlightedIndex
                  ? "bg-violet-500/15 text-white"
                  : "text-white/80 hover:bg-white/5"
              }`}
            >
              {logo ? (
                <img
                  src={logo}
                  alt={r.name}
                  className="h-8 w-8 shrink-0 rounded-md bg-white/10 object-contain p-1"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-xs font-bold text-violet-300">
                  {r.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="truncate text-[11px] text-white/40">
                  {r.domain ?? r.type}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isOwn
                    ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-white/5 text-white/55"
                }`}
              >
                {isOwn ? "Tracker" : "Brand"}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/SearchDropdown.tsx
git commit -m "feat(intelligence): SearchDropdown component with keyboard nav scaffold"
```

---

### Task C2: Wire `TrackerSearch` to use the dropdown

**Files:**
- Modify: `src/app/intelligence/_components/TrackerSearch.tsx`

- [ ] **Step 1: Replace `TrackerSearch` with multi-result version**

Full file replacement for `src/app/intelligence/_components/TrackerSearch.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { TTLookupResult } from "@/lib/trendtrack";
import { SearchDropdown } from "./SearchDropdown";

export function TrackerSearch({
  onResult,
}: {
  onResult: (result: TTLookupResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TTLookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [emptyQuery, setEmptyQuery] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setEmptyQuery(null);
    try {
      const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as TTLookupResult[] | { error: string; code?: string };
      if (!Array.isArray(data)) {
        setError(data.error ?? "Search failed");
        setResults([]);
        setOpen(false);
        onResult(null);
      } else {
        const limited = data.slice(0, 8);
        setResults(limited);
        setHighlighted(0);
        setOpen(true);
        if (limited.length === 0) setEmptyQuery(q);
      }
    } catch {
      setError("Network error");
      setResults([]);
      setOpen(false);
      onResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, onResult]);

  const pick = useCallback(
    (r: TTLookupResult) => {
      setOpen(false);
      onResult(r);
    },
    [onResult]
  );

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (open && results[highlighted]) pick(results[highlighted]);
                else handleSearch();
              } else if (e.key === "ArrowDown") {
                if (results.length > 0) {
                  e.preventDefault();
                  setOpen(true);
                  setHighlighted((i) => (i + 1) % results.length);
                }
              } else if (e.key === "ArrowUp") {
                if (results.length > 0) {
                  e.preventDefault();
                  setHighlighted((i) => (i - 1 + results.length) % results.length);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Search brand or domain…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50 focus:ring-0"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </div>
      {open && (
        <SearchDropdown
          results={results}
          highlightedIndex={highlighted}
          onHighlight={setHighlighted}
          onPick={pick}
          onClose={() => setOpen(false)}
          emptyQuery={results.length === 0 ? emptyQuery : null}
        />
      )}
      {error && <p className="text-xs text-red-400 px-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 3: Manual smoke**

Run `npm run dev`, go to `/intelligence`. Type "nike" and press Enter. Expected:
- Dropdown shows up to 8 results with logos / names / type badges.
- ↑/↓ moves highlight; Enter selects; Esc closes.
- Clicking outside closes dropdown.
- Search button uses the raised violet Youry style.

- [ ] **Step 4: Commit**

```bash
git add src/app/intelligence/_components/TrackerSearch.tsx
git commit -m "feat(intelligence): multi-result search dropdown with keyboard nav"
```

---

## Phase D — Hero strip + credits chip + Overview fusion

### Task D1: `/api/intelligence/usage` endpoint

**Files:**
- Modify: `src/lib/trendtrack.ts`
- Create: `src/app/api/intelligence/usage/route.ts`

- [ ] **Step 1: Add `ttGetUsage` to `lib/trendtrack.ts`**

Append to `src/lib/trendtrack.ts`:

```ts
export type TTUsage = {
  remaining?: number;
  used?: number;
  plan?: string;
};

export async function ttGetUsage(): Promise<TTUsage> {
  return ttFetch<TTUsage>("/v1/usage");
}
```

- [ ] **Step 2: Create the route**

Create `src/app/api/intelligence/usage/route.ts`:

```ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetUsage } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 5;
const KEY = "usage:summary";

export async function GET() {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const cached = await getCached(KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttGetUsage();
    await setCached(KEY, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    return respondTrendTrackError(err, KEY);
  }
}
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Smoke**

Run `npm run dev`, then `curl http://localhost:3000/api/intelligence/usage` (with a logged-in browser session cookie, or hit it inside the page later). Expected: 200 with `{ remaining, used, plan }` or `{ error, code }` on failure.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trendtrack.ts src/app/api/intelligence/usage/route.ts
git commit -m "feat(intelligence): /api/intelligence/usage with 5min cache"
```

---

### Task D2: `CreditsChip` component

**Files:**
- Create: `src/app/intelligence/_components/CreditsChip.tsx`

- [ ] **Step 1: Component**

Create `src/app/intelligence/_components/CreditsChip.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";

type Usage = { remaining?: number; used?: number; plan?: string };

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return String(n);
}

function tone(remaining: number): { ring: string; text: string; bg: string } {
  if (remaining > 5_000)
    return {
      ring: "border-violet-300/35",
      text: "text-violet-100",
      bg: "bg-violet-500/15",
    };
  if (remaining > 1_000)
    return {
      ring: "border-amber-300/35",
      text: "text-amber-100",
      bg: "bg-amber-500/15",
    };
  return {
    ring: "border-rose-300/35",
    text: "text-rose-100",
    bg: "bg-rose-500/15",
  };
}

export function CreditsChip() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/usage")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "remaining" in data) {
          setUsage(data as Usage);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !usage || typeof usage.remaining !== "number") return null;
  const t = tone(usage.remaining);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${t.ring} ${t.bg} ${t.text}`}
      title={`Remaining TrendTrack credits${usage.plan ? ` · ${usage.plan}` : ""}`}
    >
      <CircleDollarSign className="h-3 w-3" aria-hidden />
      {formatCredits(usage.remaining)} credits
    </span>
  );
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/CreditsChip.tsx
git commit -m "feat(intelligence): CreditsChip with color-coded thresholds"
```

---

### Task D3: `IntelligenceHero` and Overview fusion

**Files:**
- Create: `src/app/intelligence/_components/IntelligenceHero.tsx`
- Modify: `src/app/intelligence/_components/TrackerDetail.tsx`

- [ ] **Step 1: Create the hero**

Create `src/app/intelligence/_components/IntelligenceHero.tsx`:

```tsx
"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { TTOverview } from "@/lib/trendtrack";
import type { SelectedTracker } from "./TrackerList";
import { CreditsChip } from "./CreditsChip";

function formatNum(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export function IntelligenceHero({
  tracker,
  overview,
  isOwnTracker,
  lastRefreshIso,
  domain,
  onRefreshAll,
  refreshing,
}: {
  tracker: SelectedTracker;
  overview: TTOverview | null;
  isOwnTracker: boolean;
  lastRefreshIso: string | null;
  domain?: string;
  onRefreshAll: () => void;
  refreshing: boolean;
}) {
  const initial = tracker.name.charAt(0).toUpperCase();
  return (
    <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      {tracker.logo ? (
        <img
          src={tracker.logo}
          alt={tracker.name}
          className="h-12 w-12 shrink-0 rounded-xl bg-white/10 object-contain p-1"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-base font-bold text-violet-200">
          {initial}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-white">{tracker.name}</h2>
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isOwnTracker
                ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
                : "border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {isOwnTracker ? "Your tracker" : "Searched brand"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
          {domain && (
            <a
              href={`https://${domain.replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-white/55 hover:text-violet-300"
            >
              {domain}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
          {lastRefreshIso && <span>Last refresh {relativeTime(lastRefreshIso)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isOwnTracker && (
          <div className="hidden items-center gap-5 sm:flex">
            <Stat label="Active ads" value={formatNum(overview?.activeAds)} />
            <Stat label="Traffic" value={formatNum(overview?.totalTraffic)} />
            {typeof overview?.rank === "number" && (
              <Stat label="Rank" value={`#${overview.rank}`} />
            )}
          </div>
        )}
        <button
          onClick={onRefreshAll}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:border-violet-400/35 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh all
        </button>
        <CreditsChip />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-base font-semibold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Plug the hero into `TrackerDetail`, drop the standalone Overview block**

In `src/app/intelligence/_components/TrackerDetail.tsx`:

a) Import the hero and a `useMemo` hook:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { IntelligenceHero } from "./IntelligenceHero";
```

b) Track per-block last-success timestamps. Add four new states near the existing ones:

```tsx
const [overviewAt, setOverviewAt] = useState<string | null>(null);
const [adsAt, setAdsAt] = useState<string | null>(null);
const [anglesAt, setAnglesAt] = useState<string | null>(null);
const [opportunitiesAt, setOpportunitiesAt] = useState<string | null>(null);
```

After the success path of each fetch (right after `setOverview(parsed.data)` etc.), add `setOverviewAt(new Date().toISOString())` (and the equivalents for the other three).

c) Compute `lastRefreshIso`:

```tsx
const lastRefreshIso = useMemo(() => {
  const candidates = [overviewAt, adsAt, anglesAt, opportunitiesAt].filter(
    (v): v is string => Boolean(v)
  );
  if (candidates.length === 0) return null;
  return candidates.sort().slice(-1)[0];
}, [overviewAt, adsAt, anglesAt, opportunitiesAt]);
```

d) Add a refresh-all helper and a refreshing flag derived from any block being loading:

```tsx
const refreshAll = useCallback(() => {
  fetchOverview(true);
  fetchAds(true);
  fetchAngles(true);
  fetchOpportunities(true);
}, [fetchOverview, fetchAds, fetchAngles, fetchOpportunities]);

const anyLoading =
  overviewLoading || adsLoading || anglesLoading || oppsLoading;
```

e) Replace the existing top-of-detail header *and* the standalone Overview `<section>` with a single `<IntelligenceHero …>` call:

```tsx
return (
  <div className="flex flex-col gap-5 p-6">
    <IntelligenceHero
      tracker={tracker}
      overview={overview}
      isOwnTracker={isOwnTracker}
      lastRefreshIso={lastRefreshIso}
      domain={(tracker as SelectedTracker & { domain?: string }).domain}
      onRefreshAll={refreshAll}
      refreshing={anyLoading}
    />

    {/* Top Ads, Angles, Hooks, Opportunities sections — UNCHANGED below */}
```

Delete the old `<div className="flex items-center gap-3">…</div>` header and the entire old `<section>` for Overview (the one that renders inside `{isOwnTracker && (<section…/>)}` and contains the BlockHeader title="Overview"). Keep all four remaining `<section>` blocks (Top Ads, Dominant Angles, Top Hooks, 5 Opportunities).

f) Pass the tracker's `domain` from the `SelectedTracker` type. To support that, in `TrackerList.tsx` add `domain?: string` to the `SelectedTracker` type and populate it from `t.domain` / `searchResult.domain` where the type is constructed (3 places — search through the file for `sourceType:` assignments).

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`. Expected:
- Detail view starts with a single hero strip with logo, name, type badge, domain link if present, "Last refresh N min ago", inline stats, Refresh all button, credits chip on the right.
- The previous "Overview" card no longer exists as its own section.
- Refresh all spins all four block refresh icons simultaneously.
- The credits chip displays a number + correct color band (violet > 5k).

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/_components/IntelligenceHero.tsx \
        src/app/intelligence/_components/TrackerDetail.tsx \
        src/app/intelligence/_components/TrackerList.tsx
git commit -m "feat(intelligence): hero strip with inline stats and credits chip"
```

---

## Phase E — Pinned brands

### Task E1: Supabase table

**Files:**
- Create: `supabase/intelligence_pinned.sql`

- [ ] **Step 1: SQL file**

Create `supabase/intelligence_pinned.sql`:

```sql
-- User-pinned non-tracker brands (fallback for "Save as tracker" while
-- TrendTrack does not expose a public brandtracker creation endpoint).
-- Run once in Supabase SQL Editor.

create table if not exists intelligence_pinned (
  user_id uuid not null references auth.users(id) on delete cascade,
  advertiser_id text not null,
  name text not null,
  logo text,
  domain text,
  created_at timestamptz default now(),
  primary key (user_id, advertiser_id)
);

alter table intelligence_pinned enable row level security;

create policy "intelligence_pinned_select_own"
  on intelligence_pinned for select
  using (auth.uid() = user_id);

create policy "intelligence_pinned_insert_own"
  on intelligence_pinned for insert
  with check (auth.uid() = user_id);

create policy "intelligence_pinned_delete_own"
  on intelligence_pinned for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply in Supabase**

Open Supabase dashboard → SQL Editor, paste, run. Verify the table appears with RLS on.

- [ ] **Step 3: Commit the file**

```bash
git add supabase/intelligence_pinned.sql
git commit -m "feat(intelligence): supabase table for user-pinned brands"
```

---

### Task E2: `/api/intelligence/pinned` route

**Files:**
- Create: `src/app/api/intelligence/pinned/route.ts`

- [ ] **Step 1: Route handler**

Create `src/app/api/intelligence/pinned/route.ts`:

```ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type PinnedRow = {
  advertiser_id: string;
  name: string;
  logo: string | null;
  domain: string | null;
  created_at: string;
};

export async function GET() {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("intelligence_pinned")
    .select("advertiser_id, name, logo, domain, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []) as PinnedRow[]);
}

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    advertiser_id?: string;
    name?: string;
    logo?: string;
    domain?: string;
  };
  if (!body.advertiser_id || !body.name)
    return NextResponse.json({ error: "Missing advertiser_id or name" }, { status: 400 });

  const { error } = await supabase.from("intelligence_pinned").upsert({
    user_id: user.id,
    advertiser_id: body.advertiser_id,
    name: body.name,
    logo: body.logo ?? null,
    domain: body.domain ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("advertiser_id");
  if (!id) return NextResponse.json({ error: "Missing advertiser_id" }, { status: 400 });

  const { error } = await supabase
    .from("intelligence_pinned")
    .delete()
    .eq("user_id", user.id)
    .eq("advertiser_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

If `requireSupabaseUser()` does not return both `user` and `supabase`, inspect the existing helper at `src/lib/supabase/requireUser.ts` and adapt — the most common shape returns `{ response?, user?, supabase? }`. Read that file before this step and adjust the destructuring. If only `user` is returned, build a server client with `createSupabaseServerClient()` from `@/lib/supabase/server`.

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/intelligence/pinned/route.ts
git commit -m "feat(intelligence): /api/intelligence/pinned CRUD"
```

---

### Task E3: Wire pin/unpin into the UI

**Files:**
- Modify: `src/app/intelligence/_components/TrackerList.tsx`
- Modify: `src/app/intelligence/_components/IntelligenceClient.tsx`

- [ ] **Step 1: Fetch and display pinned brands above the trackers**

In `src/app/intelligence/_components/TrackerList.tsx`, extend the component:

a) Add a `pinned` state next to the existing `trackers` state:

```tsx
const [pinned, setPinned] = useState<
  Array<{ advertiser_id: string; name: string; logo: string | null; domain: string | null }>
>([]);
```

b) Fetch `/api/intelligence/pinned` in the existing `useEffect` (or a new one) and set state.

c) Above the `trackers.map(...)` block, render the pinned cards:

```tsx
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
    <p className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
      Trackers
    </p>
  </>
)}
```

(The trackers heading in the parent is already rendered above this list — you may keep it and remove the duplicated "Trackers" sub-heading if double-printing happens. Inspect the runtime once.)

- [ ] **Step 2: Add a pin button to selected non-tracker results**

In `src/app/intelligence/_components/IntelligenceClient.tsx`, when the current `selected` is `sourceType === "search"`, render a small `Pin` button in the sub-sidebar header (or as an overlay on the `searchResult` card). Easiest path: extend the `TrackerCard` rendering inside `TrackerList.tsx` to include a `+ Pin` icon button on hover for `searchResult` rows.

In `TrackerList.tsx`, replace the `searchResult && (<TrackerCard …/>)` block with:

```tsx
{searchResult && (
  <div className="relative">
    <TrackerCard … /> {/* existing props */}
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
  </div>
)}
```

And add the `PinButton` component at the bottom of the same file:

```tsx
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
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`. Search a brand that isn't yet a tracker (e.g. "nike" if you don't track Nike). Click `+ Pin` on the search-result card. Refresh the page → expected: the brand appears under "Pinned brands" above the tracker list. Click "Pinned" again to unpin → it disappears.

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/_components/TrackerList.tsx \
        src/app/intelligence/_components/IntelligenceClient.tsx
git commit -m "feat(intelligence): pin/unpin searched brands"
```

---

## Phase F — Block polish

### Task F1: AdCard hover + click → modal trigger

**Files:**
- Modify: `src/app/intelligence/_components/AdCard.tsx`

- [ ] **Step 1: Wire `onView` to a wrapping button + add hover violet glow**

Replace the entire `AdCard` component body in `src/app/intelligence/_components/AdCard.tsx`:

```tsx
"use client";

import type { TTAd } from "@/lib/trendtrack";

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  tiktok: "TikTok",
};

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function AdCard({ ad, onView }: { ad: TTAd; onView?: () => void }) {
  const thumbnail = ad.thumbnailUrl ?? ad.previewUrl ?? ad.imageUrl;
  const platform = ad.platform ?? "meta";
  const label = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
  const date = ad.startDate ?? ad.firstSeen;

  const Wrapper = onView ? "button" : "div";
  return (
    <Wrapper
      onClick={onView}
      className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-sm transition hover:border-violet-500/40 hover:bg-white/[0.07] hover:shadow-[0_0_22px_rgba(139,92,246,0.18)]"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/5">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={ad.headline ?? ad.title ?? "Ad"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
            No preview
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
          {label}
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
          {formatReach(ad.reach)}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-white/75">
        {ad.headline ?? ad.title ?? ad.body ?? "—"}
      </p>

      <div className="flex items-center justify-between text-[11px] text-white/45">
        <span>{date ?? ""}</span>
        {ad.adUrl && (
          <a
            href={ad.adUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-violet-400 hover:text-violet-300 hover:underline"
          >
            Original →
          </a>
        )}
      </div>
    </Wrapper>
  );
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/AdCard.tsx
git commit -m "feat(intelligence): AdCard hover glow and click-to-view trigger"
```

---

### Task F2: `AdModal` component

**Files:**
- Create: `src/app/intelligence/_components/AdModal.tsx`
- Modify: `src/app/intelligence/_components/TrackerDetail.tsx`

- [ ] **Step 1: Modal component**

Create `src/app/intelligence/_components/AdModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import type { TTAd } from "@/lib/trendtrack";

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function AdModal({ ad, onClose }: { ad: TTAd | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose]);

  if (!ad) return null;

  const thumbnail = ad.thumbnailUrl ?? ad.previewUrl ?? ad.imageUrl;
  const hook = ad.headline ?? ad.title ?? "";
  const body = ad.body ?? ad.text ?? "";
  const platform = ad.platform ?? "meta";
  const label = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0912]/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/70 backdrop-blur transition hover:border-violet-400/35 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative aspect-video w-full bg-black">
          {thumbnail ? (
            <img src={thumbnail} alt={hook} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
              No preview
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-200">
              {label}
            </span>
            {ad.reach && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/60">
                Reach {ad.reach.toLocaleString()}
              </span>
            )}
            {ad.startDate && (
              <span className="text-white/40">First seen {ad.startDate}</span>
            )}
          </div>
          {hook && <p className="text-base font-semibold text-white">{hook}</p>}
          {body && <p className="text-sm leading-relaxed text-white/70">{body}</p>}

          <div className="mt-2 flex items-center gap-2">
            {hook && (
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(hook);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-violet-400 px-3 py-1.5 text-xs font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 active:translate-y-[2px] active:shadow-none"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy hook"}
              </button>
            )}
            {ad.adUrl && (
              <a
                href={ad.adUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-violet-400/35 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
                Original ad
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire from `TrackerDetail`**

In `src/app/intelligence/_components/TrackerDetail.tsx`:

a) Import:

```tsx
import { AdModal } from "./AdModal";
```

b) Add state:

```tsx
const [openAd, setOpenAd] = useState<TTAd | null>(null);
```

c) In the Top Ads `<section>`'s grid, change `<AdCard key={ad.id} ad={ad} />` to `<AdCard key={ad.id} ad={ad} onView={() => setOpenAd(ad)} />`.

d) At the bottom of the returned tree (just before the final `</div>`), add:

```tsx
<AdModal ad={openAd} onClose={() => setOpenAd(null)} />
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

- [ ] **Step 4: Manual smoke**

`npm run dev`, click any ad card. Expected: modal opens, Esc / click backdrop / X all close it. Copy hook button toggles to "Copied!" briefly.

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/_components/AdModal.tsx \
        src/app/intelligence/_components/TrackerDetail.tsx
git commit -m "feat(intelligence): full-screen AdModal with hook copy"
```

---

### Task F3: `HooksTable` per-row copy + CSV export

**Files:**
- Modify: `src/app/intelligence/_components/HooksTable.tsx`

- [ ] **Step 1: Replace the component**

Full replacement for `src/app/intelligence/_components/HooksTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Copy, Download } from "lucide-react";
import type { TTAd } from "@/lib/trendtrack";

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function csvEscape(s: string): string {
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function HooksTable({ ads, brandSlug }: { ads: TTAd[]; brandSlug?: string }) {
  const hooks = useMemo(
    () =>
      ads
        .map((ad) => ({
          hook: ad.headline ?? ad.title ?? ad.body?.slice(0, 120) ?? "",
          platform: ad.platform ?? "meta",
          reach: ad.reach,
          firstSeen: ad.startDate ?? ad.firstSeen ?? "",
        }))
        .filter((h) => h.hook)
        .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)),
    [ads]
  );

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (hooks.length === 0) return <p className="text-sm text-white/40">No hooks found.</p>;

  function exportCsv() {
    const header = ["hook", "platform", "reach", "first_seen"];
    const rows = hooks.map((h) =>
      [csvEscape(h.hook), csvEscape(h.platform), String(h.reach ?? ""), csvEscape(h.firstSeen)].join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `hooks-${brandSlug ?? "brand"}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-violet-400/35 hover:text-white"
        >
          <Download className="h-3 w-3" />
          Export CSV
        </button>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40">
              <th className="pb-2 pr-4 font-normal">Hook</th>
              <th className="pb-2 pr-4 font-normal">Platform</th>
              <th className="pb-2 pr-4 font-normal text-right">Reach</th>
              <th className="pb-2 font-normal text-right" />
            </tr>
          </thead>
          <tbody>
            {hooks.map((h, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-4 text-white/75 max-w-xs">
                  <span className="line-clamp-2">{h.hook}</span>
                </td>
                <td className="py-2 pr-4 text-white/50 capitalize">{h.platform}</td>
                <td className="py-2 pr-4 text-right text-white/70">{formatReach(h.reach)}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(h.hook);
                      setCopiedIdx(i);
                      window.setTimeout(
                        () => setCopiedIdx((cur) => (cur === i ? null : cur)),
                        1200
                      );
                    }}
                    className="rounded-md p-1 text-white/40 transition hover:bg-white/5 hover:text-violet-200"
                    title="Copy hook"
                  >
                    {copiedIdx === i ? (
                      <span className="text-[11px] text-violet-200">✓</span>
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `brandSlug` from `TrackerDetail`**

In `src/app/intelligence/_components/TrackerDetail.tsx`, change `<HooksTable ads={ads} />` to:

```tsx
<HooksTable
  ads={ads}
  brandSlug={tracker.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}
/>
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

- [ ] **Step 4: Manual smoke**

`npm run dev`, open a tracker. In the Hooks block, click `Export CSV` — file downloads. Open it: header row + escaped values. Click the per-row copy button — checkmark briefly replaces the icon.

- [ ] **Step 5: Commit**

```bash
git add src/app/intelligence/_components/HooksTable.tsx \
        src/app/intelligence/_components/TrackerDetail.tsx
git commit -m "feat(intelligence): per-row hook copy and CSV export"
```

---

### Task F4: Opportunities — `brief` field + Ads Studio CTA

**Files:**
- Modify: `src/app/api/intelligence/trackers/[id]/opportunities/route.ts`
- Modify: `src/app/intelligence/_components/OpportunitiesPanel.tsx`

- [ ] **Step 1: Extend the `Opportunity` type and Claude prompt**

In `src/app/api/intelligence/trackers/[id]/opportunities/route.ts`:

a) Update the type:

```ts
export type Opportunity = { title: string; description: string; brief?: string };
```

b) Update the prompt's example and rules:

```ts
function buildOpportunitiesPrompt(
  trackerName: string,
  competitorAngles: Angle[],
  ownAngles: Angle[]
): string {
  return `You are a creative strategist for e-commerce.

Own brand uses these creative angles: ${JSON.stringify(ownAngles.map((a) => a.label))}
Competitor "${trackerName}" uses these angles: ${JSON.stringify(competitorAngles.map((a) => a.label))}

Identify 5 untapped creative opportunities — angles the competitor uses heavily that the brand doesn't, or fresh angles neither exploits yet.

Return ONLY valid JSON — no markdown:
{"opportunities":[{"title":"Leverage social proof","description":"The competitor uses customer testimonials heavily. A UGC video format showing real customer reactions could differentiate your brand.","brief":"15-second UGC clip: a real customer reacting to first use of the product. Hand-held vertical, no music, captions."}]}

Rules:
- Titles: action-oriented, max 6 words
- Descriptions: 1-2 sentences, concrete and actionable
- Brief: optional one-sentence creative brief (≤ 25 words) suitable as an Ads Studio prompt prefill — only include when you have a specific shot/format in mind`;
}
```

c) Bump cache version. Because cached entries with the old shape are still valid as `Opportunity` (extra optional field), no migration is required. But to force a re-fetch, change the cache key prefix from `tracker:${id}:opportunities:` to `tracker:${id}:opportunities:v2:`. Update both `setCached` and `getCached` calls in this file.

- [ ] **Step 2: Update the panel UI**

Full replacement for `src/app/intelligence/_components/OpportunitiesPanel.tsx`:

```tsx
"use client";

import { Sparkles } from "lucide-react";
import type { Opportunity } from "@/app/api/intelligence/trackers/[id]/opportunities/route";

export function OpportunitiesPanel({
  opportunities,
  needsAngles,
  message,
}: {
  opportunities: Opportunity[];
  needsAngles?: boolean;
  message?: string;
}) {
  if (needsAngles) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        {message ?? "Visit your own trackers first to compute angles before generating opportunities."}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return <p className="text-sm text-white/40">No opportunities found.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {opportunities.map((op, i) => (
        <article
          key={i}
          className="relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-violet-400/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-200">
              {i + 1}
            </span>
            <h4 className="text-sm font-semibold text-white">{op.title}</h4>
          </div>
          <p className="text-xs leading-relaxed text-white/65">{op.description}</p>
          {op.brief && (
            <a
              href={`/ads-studio?prefill=${encodeURIComponent(op.brief)}`}
              className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Sparkles className="h-3 w-3" />
              Use in Ads Studio
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke**

`npm run dev`, open a tracker, force-refresh the Opportunities block (it'll re-call Claude under the new cache key). Expected: 2-column grid of numbered cards. If a `brief` came back, the violet "Use in Ads Studio" CTA shows up — clicking it navigates to `/ads-studio?prefill=…`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/intelligence/trackers/[id]/opportunities/route.ts \
        src/app/intelligence/_components/OpportunitiesPanel.tsx
git commit -m "feat(intelligence): opportunities brief field with Ads Studio handoff"
```

---

## Phase G — Final polish + verification

### Task G1: Section card consistency + spacing

**Files:**
- Modify: `src/app/intelligence/_components/TrackerDetail.tsx`

- [ ] **Step 1: Normalize all `<section>` cards to the same class**

In `TrackerDetail.tsx`, find each remaining `<section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">` and replace with:

```tsx
<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
```

(`bg-white/[0.04]` matches the hero, and `p-5` slightly more breathing room.)

Also replace the outer wrapper's `gap-6` with `gap-5`:

```tsx
<div className="flex flex-col gap-5 p-6">
```

- [ ] **Step 2: Lint + build**

```bash
npm run lint
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/TrackerDetail.tsx
git commit -m "polish(intelligence): unify card backgrounds and section spacing"
```

---

### Task G2: TrackerList visual alignment

**Files:**
- Modify: `src/app/intelligence/_components/TrackerList.tsx`

- [ ] **Step 1: Update `TrackerCard` styling for parity with the rest**

Replace the `TrackerCard` `className`:

```tsx
className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
  isSelected
    ? "border-violet-400/55 bg-violet-500/12 shadow-[0_0_18px_rgba(139,92,246,0.18)]"
    : "border-white/10 bg-white/[0.04] hover:border-violet-400/35 hover:bg-white/[0.07] hover:shadow-[0_0_14px_rgba(139,92,246,0.10)]"
}`}
```

(Smaller `rounded-xl` for sidebar density; selected gets a subtle glow.)

Also change the inner logo container `bg-white/10 p-1` to `bg-white/[0.08] p-1` for parity.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/TrackerList.tsx
git commit -m "polish(intelligence): tracker card glow and density"
```

---

### Task G3: Final integration smoke + build

**Files:** none

- [ ] **Step 1: Full build**

```bash
npm run lint
npm run build
```

Expected: both pass cleanly.

- [ ] **Step 2: Manual smoke checklist**

Run `npm run dev` and walk through:

- [ ] Rail shows `Intelligence` between Workflow and Avatar with Telescope icon.
- [ ] `/intelligence` loads inside the StudioShell (rail visible, glow blob behind).
- [ ] Sub-sidebar "Intelligence + Beta" header, search, then "Pinned brands" (if any) above "Trackers".
- [ ] Search "nike" → dropdown of up to 8 hits, ↑/↓/Enter/Esc work, click outside closes.
- [ ] Pin a search result, refresh page, it persists under "Pinned brands".
- [ ] Open a tracker → hero strip with logo, name, type badge, domain link, last-refresh, inline stats, Refresh All, credits chip.
- [ ] Top Ads grid hover glow + click → modal opens.
- [ ] Modal: Esc / backdrop / X close; Copy hook works.
- [ ] Hooks table: per-row copy + Export CSV download.
- [ ] Opportunities: 2-col grid; if a brief was returned, "Use in Ads Studio" link visible.
- [ ] Refresh All spins all four block icons.
- [ ] Set bad `TRENDTRACK_API_KEY`, restart: each block shows "TrendTrack key invalid. Contact admin."

- [ ] **Step 3: Commit any final tweaks**

If smoke surfaced trivial fixes (typo, alignment), make a single follow-up commit:

```bash
git add -A
git commit -m "polish(intelligence): smoke fixes from final pass"
```

(If nothing came up, skip this commit.)

---

## Self-review (writer ran this checklist)

- **Spec coverage** — every spec section has at least one task: Studio shell (A1-A3), nav entry (A2), typed errors (B1-B4), stale fallback (B2-B3), multi-result search (C1-C2), hero/Overview fusion (D3), credits chip (D1-D3), pinned brands fallback (E1-E3), AdCard hover + modal (F1-F2), hooks copy + CSV (F3), opportunities brief + CTA (F4), card consistency / micro-interactions (G1-G2), final smoke (G3). The "Beta pill in rail" was removed in A2 because the existing `route` entry shape doesn't carry a `beta` field — replaced by a Beta badge inside the page header (A3 Step 2).
- **No placeholders** — every code step contains the literal code; no "TBD" / "implement later". The only conditional reference is in E2 Step 1 ("inspect requireSupabaseUser shape") because the current contents of that helper aren't checked into the spec — instructions cover both common shapes.
- **Type consistency** — `TrendTrackError` (B1) is used by `respondTrendTrackError` (B3), `parseIntelResponse` codes match `TrendTrackErrorCode` (B4). `Opportunity.brief` is added in F4 and consumed in the same task. `SelectedTracker.domain` extension referenced in D3 is created in the same task. Cache key prefix `tracker:${id}:opportunities:v2:` change is internal to F4.
