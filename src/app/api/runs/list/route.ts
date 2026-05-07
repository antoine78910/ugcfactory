export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseErrMessage } from "@/lib/supabaseErrMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { mirrorRunMediaUrls, rowHasUnpersistedMedia } from "@/lib/runMediaPersistence";
import { createLivePollArchivalBudget } from "@/lib/studioGenerationsMedia";
import { serverLog } from "@/lib/serverLog";

export async function GET() {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const { data, error } = await supabase
      .from("ugc_runs")
      .select(
        "id, created_at, store_url, title, selected_image_url, video_url, generated_image_urls, packshot_urls, extracted",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    // Lazy backfill (list view): mirror ephemeral provider URLs into Supabase Storage so
    // old Projects media doesn't break when third-party CDNs expire.
    //
    // IMPORTANT PERF: this endpoint powers "My projects", so never block the HTTP
    // response on mirroring network calls. We return rows immediately, then continue
    // backfill in the background.
    const rows = (data ?? []) as any[];
    const candidates = rows.filter((r) => r && typeof r === "object" && rowHasUnpersistedMedia(r));
    if (candidates.length > 0) {
      const admin = createSupabaseServiceClient();
      if (admin) {
        const MAX_MIRROR_PER_LIST = 6;
        const toMirror = candidates.slice(0, MAX_MIRROR_PER_LIST);
        // Shared budget across all mirror calls in this request keeps total
        // archival memory bounded even when several rows have ephemeral media.
        const sharedBudget = createLivePollArchivalBudget();
        void Promise.all(
          toMirror.map(async (r) => {
            const runId = String(r.id ?? "").trim();
            if (!runId) return;
            try {
              const mirrored = await mirrorRunMediaUrls({
                admin,
                userId: user.id,
                rowId: runId,
                payload: {
                  selected_image_url: r.selected_image_url,
                  video_url: r.video_url,
                  generated_image_urls: r.generated_image_urls,
                  packshot_urls: r.packshot_urls,
                  extracted: r.extracted,
                },
                mode: "live",
                budget: sharedBudget,
              });
              if (!mirrored.changed) return;

              // Update response immediately so the UI uses the stable URLs right away.
              r.selected_image_url =
                mirrored.payload.selected_image_url !== undefined
                  ? mirrored.payload.selected_image_url
                  : r.selected_image_url;
              r.video_url = mirrored.payload.video_url !== undefined ? mirrored.payload.video_url : r.video_url;
              r.generated_image_urls =
                mirrored.payload.generated_image_urls !== undefined
                  ? mirrored.payload.generated_image_urls
                  : r.generated_image_urls;
              r.packshot_urls =
                mirrored.payload.packshot_urls !== undefined ? mirrored.payload.packshot_urls : r.packshot_urls;
              r.extracted = mirrored.payload.extracted !== undefined ? mirrored.payload.extracted : r.extracted;

              // Persist asynchronously; do not fail the list endpoint on write errors.
              void admin
                .from("ugc_runs")
                .update({
                  selected_image_url: r.selected_image_url ?? null,
                  video_url: r.video_url ?? null,
                  generated_image_urls: r.generated_image_urls ?? null,
                  packshot_urls: r.packshot_urls ?? null,
                  extracted: r.extracted ?? null,
                })
                .eq("id", runId)
                .eq("user_id", user.id)
                .then(({ error: upErr }) => {
                  if (upErr) {
                    serverLog("ugc_run_list_mirror_write_error", { runId, message: upErr.message });
                  }
                });

              serverLog("ugc_run_list_mirror", {
                runId,
                mirrored: mirrored.mirroredCount,
                candidates: mirrored.candidateCount,
              });
            } catch (e) {
              serverLog("ugc_run_list_mirror_error", {
                runId,
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }),
        );
      }
    }

    return NextResponse.json({ data: rows });
  } catch (err) {
    const message = supabaseErrMessage(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

