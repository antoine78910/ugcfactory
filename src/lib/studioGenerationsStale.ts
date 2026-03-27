import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";

/** Jobs stuck in a non-terminal state longer than this are expired (image + video studio library). */
export const STUDIO_GENERATION_STALE_MS = 2 * 24 * 60 * 60 * 1000;

const STALE_MESSAGE =
  "Generation timed out (no result after 48 hours). If credits were charged, they may be refunded automatically.";

export function staleStudioGenerationsCutoffIso(): string {
  return new Date(Date.now() - STUDIO_GENERATION_STALE_MS).toISOString();
}

/**
 * Marks in-progress rows older than {@link STUDIO_GENERATION_STALE_MS} as failed so they leave the
 * “rendering” state, appear as failed in the library, and can trigger credit refund hints.
 */
export async function markStaleInProgressStudioGenerationsFailedForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number }> {
  const cutoff = staleStudioGenerationsCutoffIso();
  const { data, error } = await supabase
    .from("studio_generations")
    .update({
      status: "failed",
      error_message: STALE_MESSAGE,
      result_urls: null,
    })
    .eq("user_id", userId)
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[markStaleInProgressStudioGenerationsFailedForUser]", error.message);
    return { count: 0 };
  }
  return { count: data?.length ?? 0 };
}

/** Service-role: expire stale jobs for all users (cron). */
export async function markStaleInProgressStudioGenerationsFailedAll(
  admin: SupabaseClient,
): Promise<{ count: number }> {
  const cutoff = staleStudioGenerationsCutoffIso();
  const { data, error } = await admin
    .from("studio_generations")
    .update({
      status: "failed",
      error_message: STALE_MESSAGE,
      result_urls: null,
    })
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[markStaleInProgressStudioGenerationsFailedAll]", error.message);
    return { count: 0 };
  }
  return { count: data?.length ?? 0 };
}
