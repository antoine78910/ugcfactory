export const runtime = "nodejs";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  mergeLookupAndAdsAdvertisers,
  rollupAdvertisersFromAdsQueryRows,
  type TTCompetitorSearchHit,
} from "@/lib/trendtrackAdvertiserSearch";
import { ttAdsQueryRawRows, ttLookup } from "@/lib/trendtrack";
import { deleteCached, getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

const TTL_SECONDS = 60 * 60;
const LIMIT = 40;

function normalizeSearchQuery(raw: string): string {
  const q = raw.trim();
  if (!q) return "";
  try {
    const looksUrl = /^https?:\/\//i.test(q) || q.startsWith("//");
    const u = new URL(looksUrl ? (q.startsWith("//") ? `https:${q}` : q) : `https://${q}`);
    const host = (u.hostname || "").replace(/^www\./i, "").trim();
    return host || q;
  } catch {
    return q.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.trim() || q;
  }
}

function looksLikeDomainQuery(q: string): boolean {
  const t = q.trim();
  if (!t || t.includes(" ")) return false;
  return /[a-z0-9-]+\.[a-z]{2,}$/i.test(t);
}

/**
 * Rich competitor search: `/v1/lookup` (0 credits) + `/v1/ads/query` (paid) to list distinct
 * advertising pages / advertisers seen in active ads for that brand or domain.
 */
export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const url = new URL(req.url);
  const rawQ = url.searchParams.get("q")?.trim() ?? "";
  if (!rawQ) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const q = normalizeSearchQuery(rawQ);
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const force = url.searchParams.get("force") === "true";
  const key = `competitors:search:v1:${createHash("sha256").update(q.toLowerCase()).digest("hex").slice(0, 16)}`;

  if (force) await deleteCached(key);
  const cached = await getCached<TTCompetitorSearchHit[]>(key);
  if (cached) return NextResponse.json(cached);

  try {
    const lookups = await ttLookup(q);

    let rawRows: unknown[] = [];
    try {
      const body = looksLikeDomainQuery(q)
        ? { searchType: "domain", q, sortBy: "reach", limit: LIMIT }
        : { searchType: "brand", q, sortBy: "reach", limit: LIMIT };
      rawRows = await ttAdsQueryRawRows(body);
    } catch {
      // Still return lookup-only results if ads/query fails (credits, partial outage, etc.).
    }

    const rollups = rollupAdvertisersFromAdsQueryRows(rawRows);
    const merged = mergeLookupAndAdsAdvertisers(lookups, rollups);
    const trimmed = merged.slice(0, 36);
    await setCached(key, trimmed, TTL_SECONDS);
    return NextResponse.json(trimmed);
  } catch (err) {
    return respondTrendTrackError(err, key);
  }
}
