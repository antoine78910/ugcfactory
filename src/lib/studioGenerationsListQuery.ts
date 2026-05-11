import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import {
  STUDIO_GENERATIONS_ALL_MERGED_MAX,
  STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT,
  STUDIO_GENERATIONS_LIST_LIMIT,
  STUDIO_LIBRARY_KINDS,
} from "@/lib/studioGenerationKinds";

/**
 * Explicit column list for list queries — avoids shipping `user_id`, `updated_at`,
 * `completed_at`, `started_at`, `provider`, `credits_charged`, `uses_personal_api`
 * which the list mapper does not read (see studioGenerationsMap.ts:185-258).
 * Trims ~30% of the JSON payload at scale.
 */
const STUDIO_GENERATIONS_LIST_COLUMNS = [
  "id",
  "created_at",
  "kind",
  "status",
  "label",
  "model",
  "external_task_id",
  "result_urls",
  "input_urls",
  "error_message",
  "credits_refund_hint_sent",
  "aspect_ratio",
].join(", ");

function byCreatedAtDesc(a: StudioGenerationRow, b: StudioGenerationRow): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * Lists studio_generations for the library UI.
 * For `all` mode, queries each kind separately so recent Link to Ad jobs cannot push out avatars/images.
 */
export async function fetchStudioGenerationRows(
  supabase: SupabaseClient,
  userId: string,
  opts:
    | { mode: "all" }
    | { kinds: string[]; limit?: number; before?: string },
): Promise<StudioGenerationRow[]> {
  if ("mode" in opts && opts.mode === "all") {
    const kinds = [...STUDIO_LIBRARY_KINDS];
    const results = await Promise.all(
      kinds.map((k) =>
        supabase
          .from("studio_generations")
          .select(STUDIO_GENERATIONS_LIST_COLUMNS)
          .eq("user_id", userId)
          .eq("kind", k)
          .order("created_at", { ascending: false })
          .limit(STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT),
      ),
    );
    const merged: StudioGenerationRow[] = [];
    for (const res of results) {
      if (res.error) throw res.error;
      for (const row of (res.data ?? []) as unknown as StudioGenerationRow[]) {
        merged.push(row);
      }
    }
    merged.sort(byCreatedAtDesc);
    return merged.slice(0, STUDIO_GENERATIONS_ALL_MERGED_MAX);
  }

  if (!("kinds" in opts)) {
    return [];
  }
  const { kinds, limit, before } = opts;
  const effectiveLimit = Math.max(
    1,
    Math.min(limit ?? STUDIO_GENERATIONS_LIST_LIMIT, STUDIO_GENERATIONS_LIST_LIMIT),
  );

  let q = supabase
    .from("studio_generations")
    .select(STUDIO_GENERATIONS_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(effectiveLimit);

  if (before) q = q.lt("created_at", before);

  if (kinds.length === 1) {
    q = q.eq("kind", kinds[0]!);
  } else {
    q = q.in("kind", kinds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as StudioGenerationRow[];
}
