export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { isPostgrestNoRows, supabaseErrMessage } from "@/lib/supabaseErrMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { mirrorRunMediaUrls, rowHasUnpersistedMedia } from "@/lib/runMediaPersistence";
import { serverLog } from "@/lib/serverLog";

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const runId = (searchParams.get("runId") ?? "").trim();
  if (!runId) return NextResponse.json({ error: "Missing `runId`." }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("ugc_runs")
      .select("*")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();
    if (error) {
      if (isPostgrestNoRows(error)) {
        return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
      }
      throw error;
    }

    /**
     * Lazy backfill: if the row still references provider-hosted media (PiAPI ephemeral,
     * fal, kie...) we mirror them into our Storage on first access so the user keeps
     * permanent links. Returns the rewritten payload immediately, even if the DB write
     * is still in flight (eventual consistency: any subsequent read sees the new URLs).
     */
    let payload = data;
    if (rowHasUnpersistedMedia(data)) {
      const admin = createSupabaseServiceClient();
      if (admin) {
        try {
          const mirrored = await mirrorRunMediaUrls({
            admin,
            userId: user.id,
            rowId: runId,
            payload: {
              selected_image_url: data.selected_image_url,
              video_url: data.video_url,
              generated_image_urls: data.generated_image_urls,
              packshot_urls: data.packshot_urls,
              extracted: data.extracted,
            },
          });
          if (mirrored.changed) {
            payload = {
              ...data,
              selected_image_url:
                mirrored.payload.selected_image_url !== undefined
                  ? mirrored.payload.selected_image_url
                  : data.selected_image_url,
              video_url:
                mirrored.payload.video_url !== undefined ? mirrored.payload.video_url : data.video_url,
              generated_image_urls:
                mirrored.payload.generated_image_urls !== undefined
                  ? mirrored.payload.generated_image_urls
                  : data.generated_image_urls,
              packshot_urls:
                mirrored.payload.packshot_urls !== undefined
                  ? mirrored.payload.packshot_urls
                  : data.packshot_urls,
              extracted: mirrored.payload.extracted !== undefined ? mirrored.payload.extracted : data.extracted,
            };
            // Persist asynchronously; don't block the response on the write.
            void admin
              .from("ugc_runs")
              .update({
                selected_image_url: payload.selected_image_url ?? null,
                video_url: payload.video_url ?? null,
                generated_image_urls: payload.generated_image_urls ?? null,
                packshot_urls: payload.packshot_urls ?? null,
                extracted: payload.extracted ?? null,
              })
              .eq("id", runId)
              .eq("user_id", user.id)
              .then(({ error: upErr }) => {
                if (upErr) {
                  serverLog("ugc_run_lazy_mirror_write_error", {
                    runId,
                    message: upErr.message,
                  });
                }
              });
            serverLog("ugc_run_lazy_mirror", {
              runId,
              mirrored: mirrored.mirroredCount,
              candidates: mirrored.candidateCount,
            });
          }
        } catch (e) {
          serverLog("ugc_run_lazy_mirror_error", {
            runId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return NextResponse.json({ data: payload });
  } catch (err) {
    const message = supabaseErrMessage(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
