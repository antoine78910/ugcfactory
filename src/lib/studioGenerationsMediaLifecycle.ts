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
import { mirrorRunMediaUrls, rowHasUnpersistedMedia } from "@/lib/runMediaPersistence";

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
    // Skip rows where ALL URLs are already on our storage, nothing to migrate.
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

type UgcRunMediaRow = {
  id: string;
  user_id: string;
  selected_image_url: string | null;
  video_url: string | null;
  generated_image_urls: string[] | null;
  packshot_urls: string[] | null;
  extracted: unknown;
};

/**
 * Migrate ANY provider-hosted (ephemeral) media URLs found in `ugc_runs` rows
 * (Link to Ad / Workflow projects) into `studio-media`. Covers `selected_image_url`,
 * `video_url`, `generated_image_urls`, `packshot_urls`, and the `extracted` JSONB
 * (Link to Ad universe with embedded Kling / Nano Banana / Seedance URLs).
 * Returns counts; a single row with N migrated URLs counts as `updated += 1`.
 */
export async function backfillEphemeralUgcRunMedia(
  admin: SupabaseClient,
  limit: number,
): Promise<{ scanned: number; updated: number; mirroredUrls: number }> {
  const { data: rows, error } = await admin
    .from("ugc_runs")
    .select("id, user_id, selected_image_url, video_url, generated_image_urls, packshot_urls, extracted")
    .order("created_at", { ascending: false })
    .limit(Math.min(2000, limit * 20));

  if (error) throw error;

  let scanned = 0;
  let updated = 0;
  let mirroredUrls = 0;
  for (const row of (rows ?? []) as UgcRunMediaRow[]) {
    if (!rowHasUnpersistedMedia(row)) continue;
    scanned++;
    try {
      const mirrored = await mirrorRunMediaUrls({
        admin,
        userId: row.user_id,
        rowId: row.id,
        payload: {
          selected_image_url: row.selected_image_url,
          video_url: row.video_url,
          generated_image_urls: row.generated_image_urls,
          packshot_urls: row.packshot_urls,
          extracted: row.extracted,
        },
      });
      if (!mirrored.changed) continue;

      const { error: upErr } = await admin
        .from("ugc_runs")
        .update({
          selected_image_url: mirrored.payload.selected_image_url ?? null,
          video_url: mirrored.payload.video_url ?? null,
          generated_image_urls: mirrored.payload.generated_image_urls ?? null,
          packshot_urls: mirrored.payload.packshot_urls ?? null,
          extracted: mirrored.payload.extracted ?? null,
        })
        .eq("id", row.id);
      if (upErr) {
        serverLog("ugc_run_media_backfill_update_error", { id: row.id, message: upErr.message });
        continue;
      }
      updated++;
      mirroredUrls += mirrored.mirroredCount;
      if (updated >= limit) break;
    } catch (e) {
      serverLog("ugc_run_media_backfill_error", {
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (updated > 0) {
    serverLog("ugc_run_media_backfill", { scanned, updated, mirroredUrls });
  }
  // Reference helper to keep import live for non-Storage migrations later.
  void isStudioMediaPublicUrl;
  return { scanned, updated, mirroredUrls };
}
