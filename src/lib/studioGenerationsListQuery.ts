import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import {
  STUDIO_GENERATIONS_ALL_MERGED_MAX,
  STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT,
  STUDIO_GENERATIONS_LIST_LIMIT,
  STUDIO_LIBRARY_KINDS,
} from "@/lib/studioGenerationKinds";

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
  opts: { mode: "all" } | { kinds: string[] },
): Promise<StudioGenerationRow[]> {
  if ("mode" in opts && opts.mode === "all") {
    const kinds = [...STUDIO_LIBRARY_KINDS];
    const results = await Promise.all(
      kinds.map((k) =>
        supabase
          .from("studio_generations")
          .select("*")
          .eq("user_id", userId)
          .eq("kind", k)
          .order("created_at", { ascending: false })
          .limit(STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT),
      ),
    );
    const merged: StudioGenerationRow[] = [];
    for (const res of results) {
      if (res.error) throw res.error;
      for (const row of (res.data ?? []) as StudioGenerationRow[]) {
        merged.push(row);
      }
    }
    merged.sort(byCreatedAtDesc);
    return merged.slice(0, STUDIO_GENERATIONS_ALL_MERGED_MAX);
  }

  if (!("kinds" in opts)) {
    return [];
  }
  const { kinds } = opts;
  let q = supabase
    .from("studio_generations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(STUDIO_GENERATIONS_LIST_LIMIT);

  if (kinds.length === 1) {
    q = q.eq("kind", kinds[0]!);
  } else {
    q = q.in("kind", kinds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StudioGenerationRow[];
}
