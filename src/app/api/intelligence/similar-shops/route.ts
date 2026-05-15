export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttGetSimilarShops, ttLookup, type TTLookupResult, type TTSimilarShop } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60 * 24;

function normalizeLookupQuery(raw: string): string {
  const q = raw.trim();
  if (!q) return "";
  try {
    const looksUrl = /^https?:\/\//i.test(q) || q.startsWith("//");
    const u = new URL(looksUrl ? (q.startsWith("//") ? `https:${q}` : q) : `https://${q}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return q.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.trim().toLowerCase() || "";
  }
}

function pickDomainFromLookups(rows: TTLookupResult[]): string {
  for (const row of rows) {
    const domain = normalizeLookupQuery(row.domain ?? "");
    if (domain) return domain;
  }
  return "";
}

function dedupeLookupResults(rows: TTLookupResult[], excludeId: string): TTLookupResult[] {
  const seen = new Set<string>();
  const out: TTLookupResult[] = [];
  for (const row of rows) {
    const id = row.id.trim();
    if (!id || id === excludeId || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

async function resolveSimilarRowsToAdvertisers(rows: TTSimilarShop[], excludeId: string): Promise<TTLookupResult[]> {
  const resolved = await Promise.allSettled(
    rows.map(async (row) => {
      const matches = await ttLookup(row.domain, { type: "advertiser" });
      const picked = matches[0];
      if (!picked) return null;
      return {
        ...picked,
        name: picked.name || row.name,
        domain: picked.domain ?? row.domain,
        activeAds: picked.activeAds ?? row.activeAds,
        totalAds: picked.totalAds ?? row.totalAds,
      } satisfies TTLookupResult;
    }),
  );

  const flattened = resolved.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  return dedupeLookupResults(flattened, excludeId);
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const domainParam = (url.searchParams.get("domain") ?? "").trim();
  const excludeId = (url.searchParams.get("excludeId") ?? "").trim();

  if (!q && !domainParam) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  let identifier = normalizeLookupQuery(domainParam);
  if (!identifier) {
    const initialLookups = await ttLookup(q, { type: "auto" }).catch(() => []);
    identifier = pickDomainFromLookups(initialLookups);
  }
  if (!identifier) {
    identifier = normalizeLookupQuery(q);
  }
  if (!identifier) {
    return NextResponse.json([]);
  }

  const cacheKey = `similar-shops:v1:${identifier}`;

  try {
    const cached = await getCached<TTSimilarShop[]>(cacheKey);
    const similarRows =
      cached ??
      (await (async () => {
        const fresh = await ttGetSimilarShops(identifier, { limit: 8, sortBy: "relevance", order: "desc" });
        await setCached(cacheKey, fresh, TTL);
        return fresh;
      })());

    const advertiserRows = await resolveSimilarRowsToAdvertisers(similarRows, excludeId);
    if (advertiserRows.length > 0) return NextResponse.json(advertiserRows.slice(0, 8));

    const fallbackLookups = await ttLookup(identifier, { type: "advertiser" }).catch(() => []);
    return NextResponse.json(dedupeLookupResults(fallbackLookups, excludeId).slice(0, 8));
  } catch (err) {
    return respondTrendTrackError(err, cacheKey);
  }
}
