import { readUniverseFromExtracted } from "@/lib/linkToAdUniverse";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Same URL normalization as My Projects grouping. */
export function normalizeStoreUrlForLtaTemplate(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const href = u.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    const t = url.trim();
    const noSlash = t.endsWith("/") ? t.slice(0, -1) : t;
    return noSlash.toLowerCase();
  }
}

export function extractedHasMarketingScripts(extracted: unknown): boolean {
  const snap = readUniverseFromExtracted(extracted);
  return Boolean(snap?.scriptsText?.trim());
}

type UgcRunRow = {
  id: string;
  user_id?: string | null;
  store_url?: string | null;
  extracted?: unknown;
  created_at?: string;
  [key: string]: unknown;
};

/**
 * Among runs for the same store URL, prefer one that has Link to Ad script angles saved.
 */
export function pickBestTemplateRunForStore<T extends UgcRunRow>(
  rows: T[],
  normalizedStoreUrl: string,
): T | null {
  const matching = rows.filter((r) => {
    const url = typeof r.store_url === "string" ? r.store_url.trim() : "";
    if (!url) return false;
    return normalizeStoreUrlForLtaTemplate(url) === normalizedStoreUrl;
  });
  if (!matching.length) return null;
  return matching.find((r) => extractedHasMarketingScripts(r.extracted)) ?? matching[0];
}

/**
 * Template catalog may point at a recent run that only has the brand brief.
 * Resolve to the sibling run that actually has marketing script angles.
 */
export async function resolveLtaTemplateRunRow(
  admin: SupabaseClient,
  catalogRunId: string,
): Promise<{ row: UgcRunRow | null; resolvedRunId: string | null; healed: boolean }> {
  const { data: primary, error } = await admin.from("ugc_runs").select("*").eq("id", catalogRunId).single();
  if (error || !primary) {
    return { row: null, resolvedRunId: null, healed: false };
  }

  const primaryRow = primary as UgcRunRow;
  if (extractedHasMarketingScripts(primaryRow.extracted)) {
    return { row: primaryRow, resolvedRunId: primaryRow.id, healed: false };
  }

  const userId = typeof primaryRow.user_id === "string" ? primaryRow.user_id.trim() : "";
  const storeUrl = typeof primaryRow.store_url === "string" ? primaryRow.store_url.trim() : "";
  if (!userId || !storeUrl) {
    return { row: primaryRow, resolvedRunId: primaryRow.id, healed: false };
  }

  const normalized = normalizeStoreUrlForLtaTemplate(storeUrl);
  const { data: siblings } = await admin
    .from("ugc_runs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const best = pickBestTemplateRunForStore((siblings ?? []) as UgcRunRow[], normalized);
  if (!best?.id || !extractedHasMarketingScripts(best.extracted)) {
    return { row: primaryRow, resolvedRunId: primaryRow.id, healed: false };
  }

  if (best.id === primaryRow.id) {
    return { row: primaryRow, resolvedRunId: primaryRow.id, healed: false };
  }

  return { row: best, resolvedRunId: best.id, healed: true };
}
