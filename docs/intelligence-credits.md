# Intelligence Dashboard — Credit & Cache Reference

## TrendTrack API Endpoints

| Endpoint | Est. credits | Cache TTL | When called |
|---|---|---|---|
| `GET /v1/me` | 0 | — | API key validation |
| `GET /v1/usage` | 0 | — | Admin / debug |
| `GET /v1/lookup` | 0 | 24 h | Brand search bar |
| `GET /v1/brandtrackers` | ~1 | 1 h | Sidebar load |
| `GET /v1/brandtrackers/{id}/overview` | ~2 | 24 h | Open a tracker |
| `GET /v1/brandtrackers/{id}/top-ads` | ~5 | 1 h | Open a tracker |
| `POST /v1/ads/query` | ~3–10 | 1 h | Free brand search |

### Typical session cost (all cache misses)

- Open one own tracker → ~8 credits (list + overview + top-ads)
- Search a brand not in trackers → ~4–11 credits (lookup + ads/query)
- Heavy day (open 5 different trackers, 5 searches, TTL expired) → ~50–70 credits max

With cache hits the repeat cost drops to **0 credits** until TTL expires.

---

## Claude API Calls

| Feature | Model | Max tokens | Cache key | TTL |
|---|---|---|---|---|
| Dominant angles (Block 3) | `claude-sonnet-4-6` | 512 | `tracker:{id}:angles` | 6 h |
| 5 Opportunities (Block 5) | `claude-sonnet-4-6` | 1 024 | `tracker:{id}:opportunities:{hash}` | 12 h |

Claude is called **once per ad batch**, never per individual ad.

---

## Cache Keys (Supabase `intelligence_cache` table)

| Key pattern | Source | TTL |
|---|---|---|
| `trackers:list` | `GET /v1/brandtrackers` | 1 h |
| `lookup:{q}` | `GET /v1/lookup?q=…` | 24 h |
| `tracker:{id}:overview` | `GET /v1/brandtrackers/{id}/overview` | 24 h |
| `tracker:{id}:top-ads` | `GET /v1/brandtrackers/{id}/top-ads` | 1 h |
| `ads:query:{sha256(body)}` | `POST /v1/ads/query` | 1 h |
| `tracker:{id}:angles` | Claude (angles prompt) | 6 h |
| `tracker:{id}:opportunities:{hash}` | Claude (opportunities prompt) | 12 h |

---

## Force Refresh

Every block in the UI has a **↻ Refresh** button. It adds `?force=true` to the API route, which:

1. Deletes the current cache entry for that key.
2. Re-fetches from TrendTrack (or re-runs Claude).
3. Writes the fresh result back to cache.

Use sparingly — each force refresh costs the full credit amount again.

---

## Monitoring Usage

Check your remaining TrendTrack credits at any time:

```bash
curl -s https://api.trendtrack.io/v1/usage \
  -H "Authorization: Bearer $TRENDTRACK_API_KEY" | jq .
```

Or hit your own API route (0 credits, requires auth):

```
GET /api/intelligence/trackers   # also returns live data which costs ~1 credit if cache expired
```

---

## Credit Optimization Rules (implemented in code)

1. `GET /v1/lookup` (0 credits) always called first to resolve brand IDs before any paid call.
2. Top-ads capped at **10 results** per request.
3. Angles route reuses the `tracker:{id}:top-ads` cache entry — no double TrendTrack charge when Block 2 and Block 3 both load.
4. Opportunities use **one single Claude prompt** comparing all own trackers vs the target tracker.
5. `TRENDTRACK_API_KEY` lives in `.env.local` — never sent to the browser.
6. Refresh is **explicit user action only** — no automatic background polling.

---

## Supabase Migration

The cache table must be created once. Run this in your **Supabase dashboard → SQL Editor**:

```sql
create table if not exists intelligence_cache (
  key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
```

File also saved at: `supabase/intelligence_cache.sql`
