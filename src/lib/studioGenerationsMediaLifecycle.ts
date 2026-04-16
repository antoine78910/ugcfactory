import type { SupabaseClient } from "@supabase/supabase-js";
import { serverLog } from "@/lib/serverLog";
import {
  isStudioMediaPublicUrl,
  persistStudioMediaUrls,
  deleteStudioMediaForRow,
  studioMediaRetentionCutoffIso,
} from "@/lib/studioGenerationsMedia";
import { normalizeResultUrls } from "@/lib/studioGenerationsMap";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";

/**
 * Migrate ALL result_urls not yet on our Supabase Storage bucket to `studio-media`.
 * Covers ephemeral CDN URLs (theapi.app etc.) AND any stable provider CDN that may expire later.
 * Saves partial progress: if only some URLs could be archived, the DB is updated with the mix
 * (studio-media URLs + original fallbacks). Remaining fallbacks are retried on the next cron tick.
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
    .limit(Math.min(1000, limit * 20));

  if (error) throw error;

  let updated = 0;
  let scanned = 0;
  for (const row of (rows ?? []) as Pick<StudioGenerationRow, "id" | "user_id" | "result_urls">[]) {
    const urls = normalizeResultUrls(row.result_urls as unknown);
    if (urls.length === 0) continue;
    // Skip rows where ALL URLs are already on our storage — nothing to migrate.
    if (urls.every(isStudioMediaPublicUrl)) continue;

    scanned++;
    const { urls: persistedUrls } = await persistStudioMediaUrls({
      admin,
      userId: row.user_id,
      rowId: row.id,
      urls,
    });

    // Save if at least one URL was successfully archived to studio-media.
    // persistStudioMediaUrls keeps fallback originals, so persistedUrls.length === urls.length.
    const anyNewlyArchived = persistedUrls.some(isStudioMediaPublicUrl);
    if (!anyNewlyArchived) continue;

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
