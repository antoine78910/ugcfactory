export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { normalizeResultUrls } from "@/lib/studioGenerationsMap";

/**
 * Lookup studio_generations rows by their `external_task_id` (provider task id).
 *
 * Used by Link to Ad Universe to recover backend-completed jobs when the user returns
 * after closing the tab — the cron may have already polled the provider and stored
 * `result_urls`, so the client should not re-poll or re-charge.
 *
 * GET /api/studio/generations/by-task?taskIds=ID1,ID2,ID3
 * Returns: { data: { [taskId]: { status, urls, errorMessage } } }
 */
export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("taskIds") ?? "").trim();
  const taskIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 32);

  if (taskIds.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const { data, error } = await supabase
    .from("studio_generations")
    .select("external_task_id, status, result_urls, error_message")
    .eq("user_id", user.id)
    .in("external_task_id", taskIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const out: Record<
    string,
    { status: string; urls: string[]; errorMessage: string | null }
  > = {};
  for (const row of data ?? []) {
    const tid = String((row as { external_task_id?: unknown }).external_task_id ?? "").trim();
    if (!tid) continue;
    const status = String((row as { status?: unknown }).status ?? "").toLowerCase();
    const urls = normalizeResultUrls((row as { result_urls?: unknown }).result_urls);
    const errMsg =
      typeof (row as { error_message?: unknown }).error_message === "string"
        ? (row as { error_message: string }).error_message.trim() || null
        : null;
    out[tid] = { status, urls, errorMessage: errMsg };
  }

  return NextResponse.json({ data: out });
}
