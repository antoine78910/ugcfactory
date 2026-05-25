export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { isPostgrestNoRows, supabaseErrMessage } from "@/lib/supabaseErrMessage";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { mirrorRunMediaUrls, rowHasUnpersistedMedia } from "@/lib/runMediaPersistence";
import { requireLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";
import { isMissingLtaTemplateTableError } from "@/lib/ltaTemplateRecordingDb";
import { serverLog } from "@/lib/serverLog";

/** Load a shared template run from the catalog (any owner's project marked Template). */
export async function GET(req: Request) {
  const auth = await requireLtaTemplateRecordingUser();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const runId = (searchParams.get("runId") ?? "").trim();
  if (!runId) return NextResponse.json({ error: "Missing `runId`." }, { status: 400 });

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    const { data: brandRow, error: brandErr } = await admin
      .from("lta_template_brands")
      .select("run_id")
      .eq("run_id", runId)
      .maybeSingle();

    if (brandErr && !isMissingLtaTemplateTableError(brandErr.message)) {
      throw brandErr;
    }
    if (!brandRow?.run_id) {
      return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
    }

    const { data, error } = await admin.from("ugc_runs").select("*").eq("id", runId).single();
    if (error) {
      if (isPostgrestNoRows(error)) {
        return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
      }
      throw error;
    }

    const ownerId = typeof data.user_id === "string" ? data.user_id : "";
    if (!ownerId) {
      return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
    }

    let payload = data;
    if (rowHasUnpersistedMedia(data)) {
      try {
        const mirrored = await mirrorRunMediaUrls({
          admin,
          userId: ownerId,
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
            extracted:
              mirrored.payload.extracted !== undefined ? mirrored.payload.extracted : data.extracted,
          };
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
            .eq("user_id", ownerId)
            .then(({ error: upErr }) => {
              if (upErr) {
                serverLog("lta_template_run_lazy_mirror_write_error", {
                  runId,
                  message: upErr.message,
                });
              }
            });
        }
      } catch (e) {
        serverLog("lta_template_run_lazy_mirror_error", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({ data: payload });
  } catch (err) {
    const message = supabaseErrMessage(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
