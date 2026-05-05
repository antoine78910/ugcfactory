# Intelligence Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/intelligence` page in Youry that shows top-performing ads, dominant creative angles, hooks, and opportunities using TrendTrack data enriched with Claude analysis, fully white-labeled.

**Architecture:** Next.js API routes proxy all TrendTrack calls server-side (API key never reaches the client). A Supabase `intelligence_cache` table stores responses with TTL to minimize TrendTrack credit usage. Claude `claude-sonnet-4-6` runs one-shot analysis on ad batches to extract angles (Block 3) and opportunities (Block 5).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase service role client, Anthropic SDK (`claudeMessagesText`), TrendTrack REST API v1

**Important:** All source files live at `C:\Users\antod\src\...` (git root = `C:\Users\antod`). The primary working directory `C:\Users\antod\OneDrive\Bureau\speel 2.0` is the docs folder only.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/intelligence_cache.sql` | Create | DB migration |
| `src/lib/trendtrack.ts` | Create | TrendTrack REST client (server-only) |
| `src/lib/trendtrackCache.ts` | Create | Supabase TTL cache layer |
| `src/app/api/intelligence/trackers/route.ts` | Create | Proxy GET /v1/brandtrackers |
| `src/app/api/intelligence/lookup/route.ts` | Create | Proxy GET /v1/lookup (0 credits) |
| `src/app/api/intelligence/trackers/[id]/overview/route.ts` | Create | Proxy tracker overview |
| `src/app/api/intelligence/trackers/[id]/top-ads/route.ts` | Create | Proxy top ads (limit 10) |
| `src/app/api/intelligence/ads/query/route.ts` | Create | Proxy POST /v1/ads/query |
| `src/app/api/intelligence/trackers/[id]/angles/route.ts` | Create | Claude angle extraction |
| `src/app/api/intelligence/trackers/[id]/opportunities/route.ts` | Create | Claude opportunities |
| `src/app/intelligence/page.tsx` | Create | Server component + auth gate |
| `src/app/intelligence/_components/IntelligenceClient.tsx` | Create | Root layout (sidebar + main) |
| `src/app/intelligence/_components/TrackerList.tsx` | Create | Sidebar tracker cards |
| `src/app/intelligence/_components/TrackerSearch.tsx` | Create | Free brand search input |
| `src/app/intelligence/_components/AdCard.tsx` | Create | Single ad creative card |
| `src/app/intelligence/_components/HooksTable.tsx` | Create | Hooks sorted by reach |
| `src/app/intelligence/_components/AnglesChart.tsx` | Create | Percentage bar chart |
| `src/app/intelligence/_components/OpportunitiesPanel.tsx` | Create | 5 opportunities list |
| `src/app/intelligence/_components/TrackerDetail.tsx` | Create | Main 5-block detail view |
| `docs/intelligence-credits.md` | Create | Credit cost reference |

---

## Task 1: Supabase Table Migration

**Files:**
- Create: `supabase/intelligence_cache.sql`

- [ ] **Step 1: Create the SQL file**

Create `C:\Users\antod\supabase\intelligence_cache.sql` with this content:

```sql
create table if not exists intelligence_cache (
  key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase dashboard → SQL Editor → paste the SQL above → Run.

Verify: go to Table Editor, confirm `intelligence_cache` appears with columns `key`, `data`, `expires_at`, `created_at`.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\antod"
git add supabase/intelligence_cache.sql
git commit -m "feat(intelligence): add intelligence_cache Supabase table"
```

---

## Task 2: TrendTrack Client + Cache Layer

**Files:**
- Create: `src/lib/trendtrack.ts`
- Create: `src/lib/trendtrackCache.ts`

- [ ] **Step 1: Create `src/lib/trendtrack.ts`**

```typescript
import { requireEnv } from "@/lib/env";

const BASE = "https://api.trendtrack.io";

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
    throw new Error(`TrendTrack ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export type TTTracker = {
  id: string;
  name: string;
  domain?: string;
  logo?: string;
  logoUrl?: string;
  favicon?: string;
  activeAds?: number;
  newAdsLastDay?: number;
  newAdsLast7Days?: number;
  totalTraffic?: number;
  rank?: number;
};

export type TTOverview = {
  activeAds?: number;
  totalTraffic?: number;
  rank?: number;
};

export type TTAd = {
  id: string;
  headline?: string;
  title?: string;
  body?: string;
  text?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  imageUrl?: string;
  platform?: string;
  reach?: number;
  impressions?: number;
  startDate?: string;
  firstSeen?: string;
  adUrl?: string;
};

export type TTLookupResult = {
  id: string;
  name: string;
  type: string;
  domain?: string;
  logo?: string;
  logoUrl?: string;
};

export async function ttListTrackers(): Promise<TTTracker[]> {
  const res = await ttFetch<{ data?: TTTracker[] }>("/v1/brandtrackers");
  return res.data ?? [];
}

export async function ttGetOverview(id: string): Promise<TTOverview> {
  return ttFetch<TTOverview>(`/v1/brandtrackers/${encodeURIComponent(id)}/overview`);
}

export async function ttGetTopAds(id: string, limit = 10): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: TTAd[] }>(
    `/v1/brandtrackers/${encodeURIComponent(id)}/top-ads?limit=${limit}`
  );
  return res.data ?? [];
}

export async function ttLookup(q: string): Promise<TTLookupResult[]> {
  const res = await ttFetch<{ data?: TTLookupResult[] }>(
    `/v1/lookup?q=${encodeURIComponent(q)}`
  );
  return res.data ?? [];
}

export async function ttQueryAds(body: Record<string, unknown>): Promise<TTAd[]> {
  const res = await ttFetch<{ data?: TTAd[] }>("/v1/ads/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data ?? [];
}
```

- [ ] **Step 2: Create `src/lib/trendtrackCache.ts`**

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export async function getCached<T>(key: string): Promise<T | null> {
  const sb = createSupabaseServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("intelligence_cache")
    .select("data, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.data as T;
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const sb = createSupabaseServiceClient();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sb
    .from("intelligence_cache")
    .upsert({ key, data: value as object, expires_at: expiresAt });
}

export async function deleteCached(key: string): Promise<void> {
  const sb = createSupabaseServiceClient();
  if (!sb) return;
  await sb.from("intelligence_cache").delete().eq("key", key);
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trendtrack.ts src/lib/trendtrackCache.ts
git commit -m "feat(intelligence): add TrendTrack client and cache layer"
```

---

## Task 3: API Routes — Trackers List + Lookup

**Files:**
- Create: `src/app/api/intelligence/trackers/route.ts`
- Create: `src/app/api/intelligence/lookup/route.ts`

- [ ] **Step 1: Create trackers list route**

Create `src/app/api/intelligence/trackers/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttListTrackers } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60; // 1h
const KEY = "trackers:list";

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const force = new URL(req.url).searchParams.get("force") === "true";
  if (force) await deleteCached(KEY);

  const cached = await getCached(KEY);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttListTrackers();
    await setCached(KEY, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create lookup route**

Create `src/app/api/intelligence/lookup/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttLookup } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60 * 24; // 24h

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const key = `lookup:${q.toLowerCase()}`;
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttLookup(q);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/intelligence/trackers/route.ts src/app/api/intelligence/lookup/route.ts
git commit -m "feat(intelligence): add trackers list and lookup API routes"
```

---

## Task 4: API Routes — Tracker Detail (Overview + Top Ads)

**Files:**
- Create: `src/app/api/intelligence/trackers/[id]/overview/route.ts`
- Create: `src/app/api/intelligence/trackers/[id]/top-ads/route.ts`

- [ ] **Step 1: Create overview route**

Create `src/app/api/intelligence/trackers/[id]/overview/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetOverview } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60 * 24; // 24h

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const key = `tracker:${id}:overview`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttGetOverview(id);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create top-ads route**

Create `src/app/api/intelligence/trackers/[id]/top-ads/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60; // 1h

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const key = `tracker:${id}:top-ads`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttGetTopAds(id, 10);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/intelligence/trackers/[id]/overview/route.ts src/app/api/intelligence/trackers/[id]/top-ads/route.ts
git commit -m "feat(intelligence): add tracker overview and top-ads API routes"
```

---

## Task 5: API Route — Ads Query (Free Brand Search)

**Files:**
- Create: `src/app/api/intelligence/ads/query/route.ts`

- [ ] **Step 1: Create ads query route**

Create `src/app/api/intelligence/ads/query/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttQueryAds } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";

const TTL = 60 * 60; // 1h

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "true";
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  const key = `ads:query:${hash}`;

  if (force) await deleteCached(key);
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttQueryAds({ ...body, limit: 10 });
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/intelligence/ads/query/route.ts
git commit -m "feat(intelligence): add ads query API route"
```

---

## Task 6: API Route — Angles (Claude Analysis)

**Files:**
- Create: `src/app/api/intelligence/trackers/[id]/angles/route.ts`

Note: This route reads from the `tracker:{id}:top-ads` cache first. If that cache misses, it fetches from TrendTrack and re-caches. This avoids double-charging credits when Block 2 (top ads) and Block 3 (angles) load for the same tracker.

- [ ] **Step 1: Create angles route**

Create `src/app/api/intelligence/trackers/[id]/angles/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetTopAds, type TTAd } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { claudeMessagesText } from "@/lib/claudeResponses";

export type Angle = { label: string; pct: number };

const ANGLES_TTL = 60 * 60 * 6;  // 6h
const TOPADS_TTL = 60 * 60;      // 1h

function buildAnglesPrompt(ads: TTAd[]): string {
  const lines = ads
    .map((ad, i) => {
      const headline = (ad.headline ?? ad.title ?? "").slice(0, 120);
      const body = (ad.body ?? ad.text ?? "").slice(0, 200);
      return `[${i + 1}] "${headline}" — "${body}"`;
    })
    .join("\n");

  return `You are a creative performance analyst. Analyze these top-performing ads and identify the dominant creative angles.

Return ONLY valid JSON — no markdown, no explanation:
{"angles":[{"label":"Social proof","pct":35},{"label":"Urgency","pct":25}]}

Rules:
- 4 to 6 angles total
- pct values must sum to 100
- Labels: concise (2-4 words), in English

Ads:
${lines}`;
}

function parseAngles(raw: string): Angle[] {
  try {
    const parsed = JSON.parse(raw) as { angles?: Angle[] };
    return parsed.angles ?? [];
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as { angles?: Angle[] };
      return parsed.angles ?? [];
    } catch {
      return [];
    }
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";
  const anglesKey = `tracker:${id}:angles`;
  const topAdsKey = `tracker:${id}:top-ads`;

  if (force) await deleteCached(anglesKey);
  const cached = await getCached<Angle[]>(anglesKey);
  if (cached) return NextResponse.json(cached);

  // Reuse top-ads cache to avoid double-charging credits
  let ads = await getCached<TTAd[]>(topAdsKey);
  if (!ads) {
    try {
      ads = await ttGetTopAds(id, 10);
      await setCached(topAdsKey, ads, TOPADS_TTL);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (ads.length === 0) {
    await setCached(anglesKey, [], ANGLES_TTL);
    return NextResponse.json([]);
  }

  try {
    const raw = await claudeMessagesText({
      user: buildAnglesPrompt(ads),
      model: "claude-sonnet-4-6",
      maxTokens: 512,
    });
    const angles = parseAngles(raw);
    await setCached(anglesKey, angles, ANGLES_TTL);
    return NextResponse.json(angles);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/intelligence/trackers/[id]/angles/route.ts
git commit -m "feat(intelligence): add Claude angles extraction API route"
```

---

## Task 7: API Route — Opportunities (Claude Analysis)

**Files:**
- Create: `src/app/api/intelligence/trackers/[id]/opportunities/route.ts`

Note: This route reads cached angles from own trackers. If an own tracker's angles aren't cached yet, it returns `{ needsAngles: true }` and the UI prompts the user to visit those trackers first.

- [ ] **Step 1: Create opportunities route**

Create `src/app/api/intelligence/trackers/[id]/opportunities/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { claudeMessagesText } from "@/lib/claudeResponses";
import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";

export type Opportunity = { title: string; description: string };

const TTL = 60 * 60 * 12; // 12h

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
{"opportunities":[{"title":"Leverage social proof","description":"The competitor uses customer testimonials heavily. A UGC video format showing real customer reactions could differentiate your brand."}]}

Rules:
- Titles: action-oriented, max 6 words
- Descriptions: 1-2 sentences, concrete and actionable`;
}

function parseOpportunities(raw: string): Opportunity[] {
  try {
    const parsed = JSON.parse(raw) as { opportunities?: Opportunity[] };
    return parsed.opportunities ?? [];
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as { opportunities?: Opportunity[] };
      return parsed.opportunities ?? [];
    } catch {
      return [];
    }
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const trackerName = url.searchParams.get("name") ?? "Competitor";
  const ownIds = (url.searchParams.get("ownIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Gather competitor angles from cache
  const competitorAngles = await getCached<Angle[]>(`tracker:${id}:angles`);
  if (!competitorAngles) {
    return NextResponse.json(
      { needsAngles: true, message: "Load this tracker's top ads first to compute angles." },
      { status: 202 }
    );
  }

  // Gather own tracker angles from cache
  const ownAnglesArrays = await Promise.all(
    ownIds.map((tid) => getCached<Angle[]>(`tracker:${tid}:angles`))
  );
  const missingOwnIds = ownIds.filter((_, i) => !ownAnglesArrays[i]);
  if (missingOwnIds.length > 0 && ownIds.length > 0) {
    return NextResponse.json(
      {
        needsAngles: true,
        missingIds: missingOwnIds,
        message: "Visit your own trackers first to compute their angles.",
      },
      { status: 202 }
    );
  }
  const ownAngles = (ownAnglesArrays.filter(Boolean) as Angle[][]).flat();

  const cacheHash = createHash("sha256")
    .update(JSON.stringify({ competitorAngles, ownAngles }))
    .digest("hex")
    .slice(0, 12);
  const key = `tracker:${id}:opportunities:${cacheHash}`;

  if (force) await deleteCached(key);
  const cached = await getCached<Opportunity[]>(key);
  if (cached) return NextResponse.json(cached);

  try {
    const raw = await claudeMessagesText({
      user: buildOpportunitiesPrompt(trackerName, competitorAngles, ownAngles),
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });
    const opportunities = parseOpportunities(raw);
    await setCached(key, opportunities, TTL);
    return NextResponse.json(opportunities);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/intelligence/trackers/[id]/opportunities/route.ts
git commit -m "feat(intelligence): add Claude opportunities API route"
```

---

## Task 8: UI Atoms — AdCard + HooksTable

**Files:**
- Create: `src/app/intelligence/_components/AdCard.tsx`
- Create: `src/app/intelligence/_components/HooksTable.tsx`

- [ ] **Step 1: Create `AdCard.tsx`**

```typescript
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

  return (
    <div className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition hover:border-violet-500/40 hover:bg-white/10">
      {thumbnail ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/5">
          <img
            src={thumbnail}
            alt={ad.headline ?? ad.title ?? "Ad"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-white/5 text-xs text-white/30">
          No preview
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-300">
          {label}
        </span>
        <span className="text-xs text-white/40">{date ?? ""}</span>
      </div>

      <p className="line-clamp-2 text-xs text-white/70">
        {ad.headline ?? ad.title ?? ad.body ?? "—"}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">
          Reach: <span className="text-white/70">{formatReach(ad.reach)}</span>
        </span>
        {ad.adUrl && (
          <a
            href={ad.adUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 hover:underline"
          >
            View →
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `HooksTable.tsx`**

```typescript
"use client";

import type { TTAd } from "@/lib/trendtrack";

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function HooksTable({ ads }: { ads: TTAd[] }) {
  const hooks = ads
    .map((ad) => ({
      hook: ad.headline ?? ad.title ?? ad.body?.slice(0, 120) ?? "",
      platform: ad.platform ?? "meta",
      reach: ad.reach,
    }))
    .filter((h) => h.hook)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  if (hooks.length === 0) {
    return <p className="text-sm text-white/40">No hooks found.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-white/40">
            <th className="pb-2 pr-4 font-normal">Hook</th>
            <th className="pb-2 pr-4 font-normal">Platform</th>
            <th className="pb-2 font-normal text-right">Reach</th>
          </tr>
        </thead>
        <tbody>
          {hooks.map((h, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              <td className="py-2 pr-4 text-white/70 max-w-xs">
                <span className="line-clamp-2">{h.hook}</span>
              </td>
              <td className="py-2 pr-4 text-white/50 capitalize">{h.platform}</td>
              <td className="py-2 text-right text-white/70">{formatReach(h.reach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/intelligence/_components/AdCard.tsx src/app/intelligence/_components/HooksTable.tsx
git commit -m "feat(intelligence): add AdCard and HooksTable UI components"
```

---

## Task 9: UI Molecules — AnglesChart + OpportunitiesPanel

**Files:**
- Create: `src/app/intelligence/_components/AnglesChart.tsx`
- Create: `src/app/intelligence/_components/OpportunitiesPanel.tsx`

- [ ] **Step 1: Create `AnglesChart.tsx`**

```typescript
"use client";

import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";

export function AnglesChart({ angles }: { angles: Angle[] }) {
  if (angles.length === 0) {
    return <p className="text-sm text-white/40">No angles data.</p>;
  }

  const sorted = [...angles].sort((a, b) => b.pct - a.pct);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((a) => (
        <div key={a.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-sm text-white/70 truncate">{a.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-700"
              style={{ width: `${a.pct}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs text-white/50">{a.pct}%</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `OpportunitiesPanel.tsx`**

```typescript
"use client";

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
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
        {message ?? "Visit your own trackers first to compute angles before generating opportunities."}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return <p className="text-sm text-white/40">No opportunities found.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {opportunities.map((op, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-white">{op.title}</p>
              <p className="text-xs text-white/60 leading-relaxed">{op.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/intelligence/_components/AnglesChart.tsx src/app/intelligence/_components/OpportunitiesPanel.tsx
git commit -m "feat(intelligence): add AnglesChart and OpportunitiesPanel components"
```

---

## Task 10: UI — TrackerList + TrackerSearch

**Files:**
- Create: `src/app/intelligence/_components/TrackerList.tsx`
- Create: `src/app/intelligence/_components/TrackerSearch.tsx`

- [ ] **Step 1: Create `TrackerList.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { TTTracker, TTLookupResult } from "@/lib/trendtrack";

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}

function TrackerCard({
  name,
  logo,
  activeAds,
  newAdsLast7Days,
  isSelected,
  onClick,
}: {
  name: string;
  logo?: string;
  activeAds?: number;
  newAdsLast7Days?: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
        isSelected
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      {logo ? (
        <img src={logo} alt={name} className="h-8 w-8 rounded-lg object-contain bg-white/10 p-1" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-xs font-bold text-violet-300">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-white">{name}</span>
        <span className="text-xs text-white/40">
          {activeAds ?? 0} active ads
          {newAdsLast7Days ? ` · +${newAdsLast7Days} this week` : ""}
        </span>
      </div>
      {newAdsLast7Days && newAdsLast7Days > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300">
          +{newAdsLast7Days}
        </span>
      ) : null}
    </button>
  );
}

export type SelectedTracker = {
  id: string;
  name: string;
  logo?: string;
  sourceType: "tracker" | "search";
};

export function TrackerList({
  selectedId,
  onSelect,
  searchResult,
}: {
  selectedId?: string;
  onSelect: (t: SelectedTracker) => void;
  searchResult?: TTLookupResult | null;
}) {
  const [trackers, setTrackers] = useState<TTTracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/intelligence/trackers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrackers(data as TTTracker[]);
        else setError(data.error ?? "Failed to load trackers");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <p className="text-xs text-red-400">{error}</p>;

  return (
    <div className="flex flex-col gap-2">
      {searchResult && (
        <TrackerCard
          name={searchResult.name}
          logo={searchResult.logo ?? searchResult.logoUrl}
          isSelected={selectedId === searchResult.id}
          onClick={() =>
            onSelect({
              id: searchResult.id,
              name: searchResult.name,
              logo: searchResult.logo ?? searchResult.logoUrl,
              sourceType: searchResult.type === "brandtracker" ? "tracker" : "search",
            })
          }
        />
      )}
      {trackers.map((t) => (
        <TrackerCard
          key={t.id}
          name={t.name}
          logo={t.logo ?? t.logoUrl ?? t.favicon}
          activeAds={t.activeAds}
          newAdsLast7Days={t.newAdsLast7Days}
          isSelected={selectedId === t.id}
          onClick={() =>
            onSelect({
              id: t.id,
              name: t.name,
              logo: t.logo ?? t.logoUrl ?? t.favicon,
              sourceType: "tracker",
            })
          }
        />
      ))}
      {trackers.length === 0 && !searchResult && (
        <p className="text-xs text-white/40 px-2">No trackers yet. Search for a brand above.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `TrackerSearch.tsx`**

```typescript
"use client";

import { useCallback, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { TTLookupResult } from "@/lib/trendtrack";

export function TrackerSearch({
  onResult,
}: {
  onResult: (result: TTLookupResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/lookup?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as TTLookupResult[] | { error: string };
      if (!Array.isArray(data)) {
        setError(data.error ?? "Search failed");
        onResult(null);
      } else {
        onResult(data[0] ?? null);
        if (!data[0]) setError("No brand found.");
      }
    } catch {
      setError("Network error");
      onResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, onResult]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search brand or domain…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-violet-500/50 focus:ring-0"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 px-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/intelligence/_components/TrackerList.tsx src/app/intelligence/_components/TrackerSearch.tsx
git commit -m "feat(intelligence): add TrackerList and TrackerSearch sidebar components"
```

---

## Task 11: UI — TrackerDetail (5-Block Main View)

**Files:**
- Create: `src/app/intelligence/_components/TrackerDetail.tsx`

- [ ] **Step 1: Create `TrackerDetail.tsx`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TTOverview, TTAd } from "@/lib/trendtrack";
import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";
import type { Opportunity } from "@/app/api/intelligence/trackers/[id]/opportunities/route";
import type { SelectedTracker } from "./TrackerList";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
import { AnglesChart } from "./AnglesChart";
import { OpportunitiesPanel } from "./OpportunitiesPanel";

function BlockHeader({
  title,
  onRefresh,
  loading,
}: {
  title: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white/70 transition disabled:opacity-30"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </button>
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

function formatNum(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function TrackerDetail({
  tracker,
  ownTrackerIds,
}: {
  tracker: SelectedTracker;
  ownTrackerIds: string[];
}) {
  const isOwnTracker = tracker.sourceType === "tracker";

  // Block 1 — Overview
  const [overview, setOverview] = useState<TTOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const fetchOverview = useCallback(
    async (force = false) => {
      if (!isOwnTracker) return;
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/overview${force ? "?force=true" : ""}`
        );
        const data = (await res.json()) as TTOverview | { error: string };
        if ("error" in data) setOverviewError(data.error);
        else setOverview(data);
      } catch {
        setOverviewError("Network error");
      } finally {
        setOverviewLoading(false);
      }
    },
    [tracker.id, isOwnTracker]
  );

  // Block 2 — Top Ads
  const [ads, setAds] = useState<TTAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);

  const fetchAds = useCallback(
    async (force = false) => {
      setAdsLoading(true);
      setAdsError(null);
      try {
        const endpoint = isOwnTracker
          ? `/api/intelligence/trackers/${tracker.id}/top-ads${force ? "?force=true" : ""}`
          : `/api/intelligence/ads/query${force ? "?force=true" : ""}`;
        const res = isOwnTracker
          ? await fetch(endpoint)
          : await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ advertiser: tracker.id }),
            });
        const data = (await res.json()) as TTAd[] | { error: string };
        if (!Array.isArray(data)) setAdsError(data.error ?? "Failed");
        else setAds(data);
      } catch {
        setAdsError("Network error");
      } finally {
        setAdsLoading(false);
      }
    },
    [tracker.id, isOwnTracker]
  );

  // Block 3 — Angles
  const [angles, setAngles] = useState<Angle[]>([]);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [anglesError, setAnglesError] = useState<string | null>(null);

  const fetchAngles = useCallback(
    async (force = false) => {
      setAnglesLoading(true);
      setAnglesError(null);
      try {
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/angles${force ? "?force=true" : ""}`
        );
        const data = (await res.json()) as Angle[] | { error: string };
        if (!Array.isArray(data)) setAnglesError(data.error ?? "Failed");
        else setAngles(data);
      } catch {
        setAnglesError("Network error");
      } finally {
        setAnglesLoading(false);
      }
    },
    [tracker.id]
  );

  // Block 5 — Opportunities
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [oppsError, setOppsError] = useState<string | null>(null);
  const [oppsNeedsAngles, setOppsNeedsAngles] = useState(false);
  const [oppsMessage, setOppsMessage] = useState<string | undefined>();

  const fetchOpportunities = useCallback(
    async (force = false) => {
      setOppsLoading(true);
      setOppsError(null);
      setOppsNeedsAngles(false);
      try {
        const ownParam = ownTrackerIds.join(",");
        const res = await fetch(
          `/api/intelligence/trackers/${tracker.id}/opportunities?name=${encodeURIComponent(tracker.name)}&ownIds=${ownParam}${force ? "&force=true" : ""}`
        );
        if (res.status === 202) {
          const body = (await res.json()) as { needsAngles: boolean; message?: string };
          setOppsNeedsAngles(true);
          setOppsMessage(body.message);
        } else {
          const data = (await res.json()) as Opportunity[] | { error: string };
          if (!Array.isArray(data)) setOppsError(data.error ?? "Failed");
          else setOpportunities(data);
        }
      } catch {
        setOppsError("Network error");
      } finally {
        setOppsLoading(false);
      }
    },
    [tracker.id, tracker.name, ownTrackerIds]
  );

  // Load all blocks on tracker change
  useEffect(() => {
    setOverview(null);
    setAds([]);
    setAngles([]);
    setOpportunities([]);
    setOppsNeedsAngles(false);
    fetchOverview();
    fetchAds();
    fetchAngles();
    fetchOpportunities();
  }, [tracker.id]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {tracker.logo ? (
          <img
            src={tracker.logo}
            alt={tracker.name}
            className="h-10 w-10 rounded-xl bg-white/10 p-1 object-contain"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-sm font-bold text-violet-300">
            {tracker.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-white">{tracker.name}</h2>
          <p className="text-xs text-white/40">
            {isOwnTracker ? "Your tracker" : "Searched brand"}
          </p>
        </div>
      </div>

      {/* Block 1 — Overview */}
      {isOwnTracker && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <BlockHeader
            title="Overview"
            onRefresh={() => fetchOverview(true)}
            loading={overviewLoading}
          />
          {overviewLoading && <Skeleton rows={1} />}
          {overviewError && <p className="text-xs text-red-400">{overviewError}</p>}
          {!overviewLoading && overview && (
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-white">{formatNum(overview.activeAds)}</p>
                <p className="text-xs text-white/40">Active ads</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatNum(overview.totalTraffic)}</p>
                <p className="text-xs text-white/40">Total traffic</p>
              </div>
              {overview.rank && (
                <div>
                  <p className="text-2xl font-bold text-white">#{overview.rank}</p>
                  <p className="text-xs text-white/40">Rank</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Block 2 — Top Ads */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader
          title="Top Ads"
          onRefresh={() => fetchAds(true)}
          loading={adsLoading}
        />
        {adsLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        )}
        {adsError && <p className="text-xs text-red-400">{adsError}</p>}
        {!adsLoading && ads.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}
        {!adsLoading && !adsError && ads.length === 0 && (
          <p className="text-sm text-white/40">No ads found.</p>
        )}
      </section>

      {/* Block 3 — Dominant Angles */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader
          title="Dominant Angles"
          onRefresh={() => fetchAngles(true)}
          loading={anglesLoading}
        />
        {anglesLoading && <Skeleton rows={5} />}
        {anglesError && <p className="text-xs text-red-400">{anglesError}</p>}
        {!anglesLoading && <AnglesChart angles={angles} />}
      </section>

      {/* Block 4 — Hooks */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader
          title="Top Hooks"
          onRefresh={() => fetchAds(true)}
          loading={adsLoading}
        />
        {adsLoading && <Skeleton rows={4} />}
        {!adsLoading && <HooksTable ads={ads} />}
      </section>

      {/* Block 5 — Opportunities */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <BlockHeader
          title="5 Opportunities"
          onRefresh={() => fetchOpportunities(true)}
          loading={oppsLoading}
        />
        {oppsLoading && <Skeleton rows={5} />}
        {oppsError && <p className="text-xs text-red-400">{oppsError}</p>}
        {!oppsLoading && (
          <OpportunitiesPanel
            opportunities={opportunities}
            needsAngles={oppsNeedsAngles}
            message={oppsMessage}
          />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/TrackerDetail.tsx
git commit -m "feat(intelligence): add TrackerDetail 5-block main view"
```

---

## Task 12: UI — IntelligenceClient (Root Layout)

**Files:**
- Create: `src/app/intelligence/_components/IntelligenceClient.tsx`

- [ ] **Step 1: Create `IntelligenceClient.tsx`**

```typescript
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
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 p-4">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="h-2 w-2 rounded-full bg-violet-400" />
          <h1 className="text-sm font-semibold text-white/80">Intelligence</h1>
        </div>
        <TrackerSearch onResult={handleSearchResult} />
        <div className="flex flex-col gap-1">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-white/30">
            Trackers
          </p>
          <TrackerList
            selectedId={selected?.id}
            onSelect={setSelected}
            searchResult={searchResult}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <TrackerDetail tracker={selected} ownTrackerIds={ownTrackerIds} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                <div className="h-5 w-5 rounded bg-violet-500/30" />
              </div>
              <p className="text-sm text-white/40">
                Select a tracker or search for a brand
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/_components/IntelligenceClient.tsx
git commit -m "feat(intelligence): add IntelligenceClient root layout component"
```

---

## Task 13: Page — Server Component + Auth Gate

**Files:**
- Create: `src/app/intelligence/page.tsx`

- [ ] **Step 1: Create `src/app/intelligence/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ttListTrackers } from "@/lib/trendtrack";
import { getCached } from "@/lib/trendtrackCache";
import type { TTTracker } from "@/lib/trendtrack";
import { IntelligenceClient } from "./_components/IntelligenceClient";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Pre-fetch tracker IDs server-side (for opportunities context)
  let ownTrackerIds: string[] = [];
  try {
    const cached = await getCached<TTTracker[]>("trackers:list");
    const trackers = cached ?? (await ttListTrackers());
    ownTrackerIds = trackers.map((t) => t.id);
  } catch {
    // non-fatal: opportunities will show "needs angles" instead
  }

  return <IntelligenceClient ownTrackerIds={ownTrackerIds} />;
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\antod"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/intelligence/page.tsx src/app/intelligence/_components/IntelligenceClient.tsx
git commit -m "feat(intelligence): add intelligence page with auth gate"
```

---

## Task 14: Env Setup + Smoke Test + Credit Docs

**Files:**
- Modify: `.env.local` (add key)
- Create: `docs/intelligence-credits.md`

- [ ] **Step 1: Add TrendTrack API key to `.env.local`**

Open `C:\Users\antod\.env.local` and add:

```
TRENDTRACK_API_KEY=your_trendtrack_api_key_here
```

- [ ] **Step 2: Start the dev server**

```bash
cd "C:\Users\antod"
npm run dev
```

- [ ] **Step 3: Smoke test**

Navigate to `http://localhost:3000/intelligence`.

Expected:
1. Page redirects to `/auth` if not logged in ✓
2. After login, sidebar shows "Intelligence" header + search bar + "Trackers" section ✓
3. Tracker cards load (or empty state "No trackers yet") ✓
4. Search for a brand name → result appears in sidebar ✓
5. Click a tracker → TrackerDetail loads with skeleton states → blocks fill in ✓
6. "Refresh" button on each block works ✓

- [ ] **Step 4: Verify no TrendTrack branding in UI**

Search the rendered page for "TrendTrack" — should find zero occurrences.

- [ ] **Step 5: Create credit docs**

Create `C:\Users\antod\OneDrive\Bureau\speel 2.0\docs\intelligence-credits.md`:

```markdown
# Intelligence Dashboard — TrendTrack Credit Reference

## How Credits Work

TrendTrack charges credits per API call. Some endpoints are free (0 credits). All responses are cached in Supabase with TTL to minimise repeat costs.

## Endpoint Credit Table

| Endpoint | Est. Credits | Cache TTL | Trigger |
|---|---|---|---|
| `GET /v1/lookup` | 0 | 24h | Brand search in sidebar |
| `GET /v1/me` | 0 | — | API key validation |
| `GET /v1/usage` | 0 | — | Admin/debug only |
| `GET /v1/brandtrackers` | ~1 | 1h | Page load (sidebar list) |
| `GET /v1/brandtrackers/{id}/overview` | ~2 | 24h | Opening a tracker (Block 1) |
| `GET /v1/brandtrackers/{id}/top-ads` | ~5 | 1h | Opening a tracker (Block 2) |
| `POST /v1/ads/query` | ~3–10 | 1h | Search result detail (Block 2) |

## Per-Session Cost Estimate

- Open 1 tracker (all blocks, no cache): **~8 credits**
- Subsequent opens within TTL: **0 credits**
- Full day heavy use: **~50–70 credits max**

## Cache Keys

| Feature | Cache Key | TTL |
|---|---|---|
| Tracker list | `trackers:list` | 1h |
| Lookup result | `lookup:{query}` | 24h |
| Tracker overview | `tracker:{id}:overview` | 24h |
| Tracker top-ads | `tracker:{id}:top-ads` | 1h |
| Ads query | `ads:query:{hash}` | 1h |
| Angles (Claude) | `tracker:{id}:angles` | 6h |
| Opportunities (Claude) | `tracker:{id}:opportunities:{hash}` | 12h |

## Force Refresh

Each block in the UI has a "Refresh" button. Clicking it appends `?force=true` to the API request, which:
1. Deletes the cache entry
2. Re-fetches from TrendTrack (costs credits)
3. Re-caches the fresh result

## Monitor Usage

Call `GET https://api.trendtrack.io/v1/usage` (0 credits) to check your remaining balance.

Via curl:
```bash
curl -H "Authorization: Bearer $TRENDTRACK_API_KEY" https://api.trendtrack.io/v1/usage
```

## Claude Token Costs

Angles extraction: ~300 input tokens + ~100 output tokens per tracker (one-shot).
Opportunities: ~400 input tokens + ~300 output tokens per comparison.
Both are cached aggressively (6h / 12h TTL).
```

- [ ] **Step 6: Commit everything**

```bash
cd "C:\Users\antod\OneDrive\Bureau\speel 2.0"
git add docs/intelligence-credits.md
git commit -m "docs(intelligence): add TrendTrack credit reference doc"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 blocks implemented (Overview, Top Ads, Angles, Hooks, Opportunities) ✓ Search + Trackers list ✓ Cache layer ✓ Force-refresh ✓ No TrendTrack branding ✓ Auth gate ✓ Credit docs ✓
- [x] **Placeholders:** None — all code blocks are complete
- [x] **Type consistency:** `TTAd`, `TTTracker`, `TTOverview`, `TTLookupResult` defined in `trendtrack.ts` and imported consistently. `Angle` exported from angles route and imported in `AnglesChart` and `TrackerDetail`. `Opportunity` exported from opportunities route and imported in `OpportunitiesPanel` and `TrackerDetail`. `SelectedTracker` exported from `TrackerList` and imported in `IntelligenceClient` and `TrackerDetail`.
