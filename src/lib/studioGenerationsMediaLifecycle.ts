import type { SupabaseClient } from "@supabase/supabase-js";
import { serverLog } from "@/lib/serverLog";
import {
  isEphemeralOrUnstableMediaUrl,
  isStudioMediaPublicUrl,
  persistStudioMediaUrls,
  deleteStudioMediaForRow,
  studioMediaRetentionCutoffIso,
} from "@/lib/studioGenerationsMedia";
import { normalizeResultUrls } from "@/lib/studioGenerationsMap";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";

/**
 * Fix rows already saved with ephemeral CDN URLs (e.g. img.theapi.app) while links still work.
 */
export async function backfillEphemeralStudioResults(
  admin: SupabaseClient,
  limit: number,
): Promise<{ scanned: number; updated: number }> {
  const { data: rows, error } = await admin
    .from("studio_generations")
    .select("id, user_id, result_urls, status")
    .eq("status", "ready")
    .not("result_urls", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(500, limit * 10));

  if (error) throw error;

  let updated = 0;
  let scanned = 0;
  for (const row of (rows ?? []) as Pick<StudioGenerationRow, "id" | "user_id" | "result_urls">[]) {
    const urls = normalizeResultUrls(row.result_urls as unknown);
    if (urls.length === 0) continue;
    if (!urls.some(isEphemeralOrUnstableMediaUrl)) continue;
    if (urls.every(isStudioMediaPublicUrl)) continue;

    scanned++;
    const { urls: persistedUrls, complete } = await persistStudioMediaUrls({
      admin,
      userId: row.user_id,
      rowId: row.id,
      urls,
    });
    if (!complete) continue;

    const { error: upErr } = await admin
      .from("studio_generations")
      .update({ result_urls: persistedUrls })
      .eq("id", row.id);
    if (upErr) {
      serverLog("studio_media_backfill_update_error", { id: row.id, message: upErr.message });
      continue;
    }
    updated++;
    if (updated >= limit) break;
  }

  if (updated > 0) {
    serverLog("studio_media_backfill", { scanned, updated });
  }
  return { scanned, updated };
}

/**
 * Remove Storage objects for generations older than retention window; clear `result_urls`.
 */
export async function applyStudioMediaRetention(
  admin: SupabaseClient,
  limit: number,
): Promise<{ purged: number }> {
  const cutoff = studioMediaRetentionCutoffIso();
  const { data: rows, error } = await admin
    .from("studio_generations")
    .select("id, result_urls")
    .eq("status", "ready")
    .not("result_urls", "is", null)
    .lt("created_at", cutoff)
    .limit(limit);

  if (error) throw error;

  let purged = 0;
  for (const row of (rows ?? []) as Pick<StudioGenerationRow, "id" | "result_urls">[]) {
    const urls = normalizeResultUrls(row.result_urls as unknown);
    const hasOurMedia = urls.some(isStudioMediaPublicUrl);
    if (!hasOurMedia) {
      const { error: upErr } = await admin.from("studio_generations").update({ result_urls: null }).eq("id", row.id);
      if (!upErr) purged++;
      continue;
    }

    await deleteStudioMediaForRow(admin, urls);
    const { error: upErr } = await admin.from("studio_generations").update({ result_urls: null }).eq("id", row.id);
    if (!upErr) purged++;
  }

  if (purged > 0) {
    serverLog("studio_media_retention", { purged, cutoff });
  }
  return { purged };
}
