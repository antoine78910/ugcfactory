# Intelligence Competitor Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “Competitors” section to `/intelligence` that lets users lookup a competitor (domain or brand), choose the correct match, fetch top ads with sortable signals, and save competitors per user.

**Architecture:** Keep all TrendTrack calls server-side behind existing `/api/intelligence/*` routes. Add a new “smart” route that routes to `brandtrackers/{id}/top-ads` only for `currentRank` when tracked, otherwise uses `ads/query`. Persist competitors in a dedicated Supabase table with RLS per user.

**Tech Stack:** Next.js App Router (nodejs runtime routes), TypeScript, Supabase (RLS), TrendTrack REST API v1, existing `trendtrackCache.ts` TTL cache.

---

## File map (what changes where)

**Server / API**
- Create: `src/app/api/intelligence/competitors/route.ts` (GET list, POST create)
- Create: `src/app/api/intelligence/competitors/[id]/route.ts` (DELETE)
- Create: `src/app/api/intelligence/competitors/top-ads/route.ts` (smart fetch + cache)
- Modify (optional): `src/lib/trendtrack.ts` (support `sortBy` for `ttGetTopAds` if needed)

**Supabase**
- Create: `supabase/migrations/2026xxxx_intelligence_competitors.sql` (table + indexes + RLS + policies)

**Client / UI**
- Create: `src/app/intelligence/_components/CompetitorsPanel.tsx`
- Modify: `src/app/intelligence/_components/IntelligenceClient.tsx` (render panel, state wiring)
- Modify: `src/app/intelligence/_components/TrackerSearch.tsx` or reuse logic (optional; keep separate section as requested)

**Docs**
- (No new docs required beyond existing spec/credits docs; keep UI copy English-only.)

---

## Task 1: Add Supabase table `intelligence_competitors` (per-user)

**Files:**
- Create: `supabase/migrations/2026xxxx_intelligence_competitors.sql`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- supabase/migrations/2026xxxx_intelligence_competitors.sql

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

alter table public.intelligence_competitors enable row level security;

drop policy if exists "intelligence_competitors_select_own" on public.intelligence_competitors;
create policy "intelligence_competitors_select_own"
  on public.intelligence_competitors
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "intelligence_competitors_insert_own" on public.intelligence_competitors;
create policy "intelligence_competitors_insert_own"
  on public.intelligence_competitors
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "intelligence_competitors_delete_own" on public.intelligence_competitors;
create policy "intelligence_competitors_delete_own"
  on public.intelligence_competitors
  for delete
  to authenticated
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration**

Run (depending on your setup):
- Supabase dashboard → SQL editor → paste contents, or
- Supabase CLI migrate (if configured).

Expected: table exists; `select` only returns rows where `user_id = auth.uid()`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026xxxx_intelligence_competitors.sql
git commit -m "db(intelligence): add intelligence_competitors table"
```

---

## Task 2: API routes for saved competitors

**Files:**
- Create: `src/app/api/intelligence/competitors/route.ts`
- Create: `src/app/api/intelligence/competitors/[id]/route.ts`

- [ ] **Step 1: Create `GET/POST /api/intelligence/competitors`**

```ts
// src/app/api/intelligence/competitors/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/createSupabaseServiceClient";

type Row = {
  id: string;
  user_id: string;
  lookup_id: string | null;
  name: string;
  domain: string | null;
  created_at: string;
};

export async function GET() {
  const { response, user } = await requireSupabaseUser();
  if (response) return response;

  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("intelligence_competitors")
    .select("id,user_id,lookup_id,name,domain,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out = (data ?? []).map((r: Row) => ({
    id: r.id,
    lookupId: r.lookup_id,
    name: r.name,
    domain: r.domain,
    createdAt: r.created_at,
  }));
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const { response, user } = await requireSupabaseUser();
  if (response) return response;

  let body: { lookupId?: unknown; name?: unknown; domain?: unknown };
  try {
    body = (await req.json()) as any;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const lookupId = typeof body.lookupId === "string" ? body.lookupId.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const sb = createSupabaseServiceClient();

  // Dedupe by (user_id, lookup_id) when available; else insert normally.
  const insert = {
    user_id: user.id,
    lookup_id: lookupId || null,
    name,
    domain: domain || null,
  };

  const { data, error } = await sb
    .from("intelligence_competitors")
    .upsert(insert, { onConflict: lookupId ? "user_id,lookup_id" : undefined as any })
    .select("id,user_id,lookup_id,name,domain,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    id: (data as Row).id,
    lookupId: (data as Row).lookup_id,
    name: (data as Row).name,
    domain: (data as Row).domain,
    createdAt: (data as Row).created_at,
  });
}
```

- [ ] **Step 2: Create `DELETE /api/intelligence/competitors/[id]`**

```ts
// src/app/api/intelligence/competitors/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/createSupabaseServiceClient";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, user } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("intelligence_competitors")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Smoke test routes**
Run dev server, then:
- `GET /api/intelligence/competitors` → `[]`
- `POST /api/intelligence/competitors` with a test payload → returns row
- `DELETE /api/intelligence/competitors/<id>` → `{ ok: true }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/intelligence/competitors/route.ts src/app/api/intelligence/competitors/[id]/route.ts
git commit -m "feat(intelligence): add saved competitors API"
```

---

## Task 3: Smart competitor top-ads route (lookup → choose → fetch)

**Files:**
- Create: `src/app/api/intelligence/competitors/top-ads/route.ts`
- Modify (optional): `src/lib/trendtrack.ts` (add `sortBy` support for `ttGetTopAds`)

- [ ] **Step 1: Extend TrendTrack client to support `sortBy` (optional but recommended)**

```ts
// src/lib/trendtrack.ts
export async function ttGetTopAds(
  id: string,
  limit = 10,
  sortBy?: string,
): Promise<TTAd[]> {
  const sort = sortBy ? `&sortBy=${encodeURIComponent(sortBy)}` : "";
  const res = await ttFetch<{ data?: TTAd[] }>(
    `/v1/brandtrackers/${encodeURIComponent(id)}/top-ads?limit=${limit}${sort}`,
  );
  return (res.data ?? []).map((ad) => normalizeTTAd(ad));
}
```

- [ ] **Step 2: Implement `GET /api/intelligence/competitors/top-ads`**

```ts
// src/app/api/intelligence/competitors/top-ads/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, ttQueryAds, ttListTrackers } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60;

function looksLikeDomain(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(" ")) return false;
  return /[a-z0-9-]+\.[a-z]{2,}$/i.test(t);
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const url = new URL(req.url);
  const lookupId = (url.searchParams.get("lookupId") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const sortBy = (url.searchParams.get("sortBy") ?? "").trim();
  const force = url.searchParams.get("force") === "true";

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  if (!sortBy) return NextResponse.json({ error: "Missing sortBy" }, { status: 400 });

  const qHash = createHash("sha256").update(q.toLowerCase()).digest("hex").slice(0, 12);
  const key = lookupId
    ? `competitor:${lookupId}:${sortBy}:top-ads`
    : `competitor:q:${qHash}:${sortBy}:top-ads`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    // determine tracked status using cached tracker list
    const trackers = await ttListTrackers();
    const trackedIds = new Set(trackers.map((t) => String(t.id ?? "").trim()).filter(Boolean));
    const isTracked = Boolean(lookupId && trackedIds.has(lookupId));

    // routing rule (B):
    if (isTracked && sortBy === "currentRank") {
      const ads = await ttGetTopAds(lookupId, 10, "currentRank");
      const payload = { source: "tracker_top_ads" as const, isTracked: true, sortBy, ads };
      await setCached(key, payload, TTL);
      return NextResponse.json(payload);
    }

    const searchType = looksLikeDomain(q) ? "domain" : "brand";
    const ads = await ttQueryAds({
      searchType,
      q,
      sortBy,
      limit: 10,
    });

    const payload = { source: "ads_query" as const, isTracked, sortBy, ads };
    await setCached(key, payload, TTL);
    return NextResponse.json(payload);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/intelligence/competitors/top-ads/route.ts src/lib/trendtrack.ts
git commit -m "feat(intelligence): add competitor top ads smart route"
```

---

## Task 4: Competitors UI panel (dropdown + save + sort)

**Files:**
- Create: `src/app/intelligence/_components/CompetitorsPanel.tsx`
- Modify: `src/app/intelligence/_components/IntelligenceClient.tsx`

- [ ] **Step 1: Create `CompetitorsPanel` component (client)**

Key behaviors:
- Input accepts domain/brand; on submit triggers lookup.
- If lookup returns >1, show dropdown (All results) and require selection before fetching ads.
- Determine tracked badge by loading `/api/intelligence/trackers` once and building a set of ids.
- Sort dropdown (default `currentRank`).
- “Save” button → POST to `/api/intelligence/competitors`
- Saved list → GET `/api/intelligence/competitors`
- Selecting a saved competitor loads ads with the current sort.
- Render ads using existing `AdCard` (and `AdModal` integration) to stay consistent.

Minimal skeleton (structure only — implement with existing UI patterns in `_components`):

```tsx
// src/app/intelligence/_components/CompetitorsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { TTLookupResult, TTAd, TTTracker } from "@/lib/trendtrack";
import AdCard from "./AdCard";

type SavedCompetitor = {
  id: string;
  lookupId: string | null;
  name: string;
  domain: string | null;
  createdAt: string;
};

type SortBy =
  | "currentRank"
  | "reach"
  | "reachDelta1d"
  | "reachDelta7d"
  | "reachDelta30d"
  | "rankDelta7d"
  | "rankDelta14d"
  | "rankDelta30d"
  | "longestRunning";

const SORT_CHOICES: { id: SortBy; label: string }[] = [
  { id: "currentRank", label: "Current rank" },
  { id: "reach", label: "Reach" },
  { id: "reachDelta7d", label: "Reach delta (7d)" },
  { id: "rankDelta7d", label: "Rank delta (7d)" },
  { id: "longestRunning", label: "Longest running" },
  { id: "reachDelta1d", label: "Reach delta (1d)" },
  { id: "reachDelta30d", label: "Reach delta (30d)" },
  { id: "rankDelta14d", label: "Rank delta (14d)" },
  { id: "rankDelta30d", label: "Rank delta (30d)" },
];

export function CompetitorsPanel() {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("currentRank");
  const [lookup, setLookup] = useState<TTLookupResult[]>([]);
  const [selected, setSelected] = useState<TTLookupResult | null>(null);
  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const [saved, setSaved] = useState<SavedCompetitor[]>([]);
  const [ads, setAds] = useState<TTAd[]>([]);
  const [loading, setLoading] = useState(false);

  const trackedSet = useMemo(() => new Set(trackers.map((t) => t.id)), [trackers]);

  useEffect(() => {
    void fetch("/api/intelligence/trackers").then((r) => r.json()).then(setTrackers).catch(() => {});
    void fetch("/api/intelligence/competitors").then((r) => r.json()).then(setSaved).catch(() => {});
  }, []);

  async function runLookup() {
    const raw = q.trim();
    if (!raw) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(raw)}`);
      const json = (await res.json()) as TTLookupResult[] | { error?: string };
      if (!res.ok || !Array.isArray(json)) throw new Error((json as any).error || "Lookup failed");
      setLookup(json);
      setSelected(null);
      setAds([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTopAds(force = false) {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/intelligence/competitors/top-ads?lookupId=${encodeURIComponent(selected.id)}&q=${encodeURIComponent(
          selected.domain || selected.name || q,
        )}&sortBy=${encodeURIComponent(sortBy)}${force ? "&force=true" : ""}`,
      );
      const json = (await res.json()) as { ads?: TTAd[]; error?: string };
      if (!res.ok || !Array.isArray(json.ads)) throw new Error(json.error || "Fetch failed");
      setAds(json.ads);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelected() {
    if (!selected) return;
    const res = await fetch("/api/intelligence/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookupId: selected.id, name: selected.name, domain: selected.domain ?? null }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    const next = await fetch("/api/intelligence/competitors").then((r) => r.json());
    setSaved(Array.isArray(next) ? next : []);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101014] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white/90">Competitors</div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="h-8 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white/80"
        >
          {SORT_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Paste a competitor domain or brand…"
          className="h-10 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"
        />
        <button type="button" onClick={runLookup} className="h-10 rounded-xl bg-violet-500 px-3 text-sm font-semibold">
          Search
        </button>
      </div>

      {/* Lookup dropdown (All results) */}
      {lookup.length > 0 ? (
        <div className="mt-2 space-y-1">
          {lookup.slice(0, 12).map((r) => {
            const isTracked = trackedSet.has(r.id);
            const active = selected?.id === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition",
                  active ? "border-violet-400/50 bg-violet-500/10 text-white" : "border-white/10 bg-black/20 text-white/75",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name} {r.domain ? <span className="text-white/45">· {r.domain}</span> : null}
                </span>
                <span className={cn("ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  isTracked ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/55",
                )}>
                  {isTracked ? "Tracked" : "Not tracked"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={!selected || loading} onClick={() => void loadTopAds(false)} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/75">
          Load top ads
        </button>
        <button type="button" disabled={!selected || loading} onClick={() => void loadTopAds(true)} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/75">
          Refresh
        </button>
        <button type="button" disabled={!selected || loading} onClick={() => void saveSelected()} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/75">
          Save
        </button>
      </div>

      {saved.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {saved.slice(0, 12).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected({ id: c.lookupId || "", name: c.name, type: "saved", domain: c.domain || undefined } as any)}
              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/75"
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {ads.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Render panel in `IntelligenceClient`**
Add `<CompetitorsPanel />` in the sidebar layout near Trackers.

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/CompetitorsPanel.tsx src/app/intelligence/_components/IntelligenceClient.tsx
git commit -m "feat(intelligence): add competitors panel"
```

---

## Task 5: Verification

**Files:**
- Test: manual

- [ ] **Step 1: Typecheck**

Run:
```bash
cd "c:\Users\antod\OneDrive\Bureau\speel 2.0\ugc-automation"
npx tsc --noEmit
```
Expected: exit code 0.

- [ ] **Step 2: Manual UX checks**
- Paste a domain returning multiple matches → dropdown appears, must choose before ads load.
- Pick **Tracked** result with default sort `currentRank` → server uses tracker top-ads (check `source` field).
- Change sort to `reachDelta7d` → server uses ads/query (check `source`).
- Save competitor → persists; reload page → still present.
- Delete competitor → removed.

- [ ] **Step 3: Push**

```bash
git push ugcfactory main
```

