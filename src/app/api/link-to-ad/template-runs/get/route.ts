export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { isPostgrestNoRows, supabaseErrMessage } from "@/lib/supabaseErrMessage";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { mirrorRunMediaUrls, rowHasUnpersistedMedia } from "@/lib/runMediaPersistence";
import { requireLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";
import { isMissingLtaTemplateTableError } from "@/lib/ltaTemplateRecordingDb";
import {
  normalizeStoreUrlForLtaTemplate,
  resolveLtaTemplateRunRow,
} from "@/lib/ltaTemplateRunResolve";
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
    const { data: brandByRun, error: brandErr } = await admin
      .from("lta_template_brands")
      .select("run_id, normalized_url")
      .eq("run_id", runId)
      .maybeSingle();

    if (brandErr && !isMissingLtaTemplateTableError(brandErr.message)) {
      throw brandErr;
    }

    let catalogNormalized =
      typeof brandByRun?.normalized_url === "string"
        ? brandByRun.normalized_url.trim().toLowerCase()
        : "";

    if (!catalogNormalized) {
      const { data: runPeek } = await admin
        .from("ugc_runs")
        .select("store_url")
        .eq("id", runId)
        .maybeSingle();
      const storeUrl = typeof runPeek?.store_url === "string" ? runPeek.store_url.trim() : "";
      if (!storeUrl) {
        return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
      }
      catalogNormalized = normalizeStoreUrlForLtaTemplate(storeUrl).toLowerCase();
      const { data: brandByUrl, error: urlErr } = await admin
        .from("lta_template_brands")
        .select("run_id")
        .eq("normalized_url", catalogNormalized)
        .maybeSingle();
      if (urlErr && !isMissingLtaTemplateTableError(urlErr.message)) {
        throw urlErr;
      }
      if (!brandByUrl?.run_id) {
        return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
      }
    }

    const { row, resolvedRunId, healed } = await resolveLtaTemplateRunRow(admin, runId);
    if (!row) {
      return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
    }

    if (healed && resolvedRunId && catalogNormalized) {
      void admin
        .from("lta_template_brands")
        .update({ run_id: resolvedRunId })
        .eq("normalized_url", catalogNormalized)
        .then(({ error: healErr }) => {
          if (healErr) {
            serverLog("lta_template_catalog_heal_error", {
              catalogNormalized,
              resolvedRunId,
              message: healErr.message,
            });
          }
        });
    }

    const ownerId = typeof row.user_id === "string" ? row.user_id : "";
    if (!ownerId) {
      return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
    }

    const effectiveRunId = resolvedRunId ?? runId;
    let payload = row;

    if (rowHasUnpersistedMedia(row)) {
      try {
        const rowSelectedImage =
          typeof row.selected_image_url === "string" ? row.selected_image_url : null;
        const rowVideoUrl = typeof row.video_url === "string" ? row.video_url : null;
        const rowGeneratedImages = Array.isArray(row.generated_image_urls)
          ? (row.generated_image_urls as string[])
          : null;
        const rowPackshots = Array.isArray(row.packshot_urls) ? (row.packshot_urls as string[]) : null;
        const mirrored = await mirrorRunMediaUrls({
          admin,
          userId: ownerId,
          rowId: effectiveRunId,
          payload: {
            selected_image_url: rowSelectedImage,
            video_url: rowVideoUrl,
            generated_image_urls: rowGeneratedImages,
            packshot_urls: rowPackshots,
            extracted: row.extracted,
          },
        });
        if (mirrored.changed) {
          payload = {
            ...row,
            selected_image_url:
              mirrored.payload.selected_image_url !== undefined
                ? mirrored.payload.selected_image_url
                : row.selected_image_url,
            video_url:
              mirrored.payload.video_url !== undefined ? mirrored.payload.video_url : row.video_url,
            generated_image_urls:
              mirrored.payload.generated_image_urls !== undefined
                ? mirrored.payload.generated_image_urls
                : row.generated_image_urls,
            packshot_urls:
              mirrored.payload.packshot_urls !== undefined
                ? mirrored.payload.packshot_urls
                : row.packshot_urls,
            extracted:
              mirrored.payload.extracted !== undefined ? mirrored.payload.extracted : row.extracted,
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
            .eq("id", effectiveRunId)
            .eq("user_id", ownerId)
            .then(({ error: upErr }) => {
              if (upErr) {
                serverLog("lta_template_run_lazy_mirror_write_error", {
                  runId: effectiveRunId,
                  message: upErr.message,
                });
              }
            });
        }
      } catch (e) {
        serverLog("lta_template_run_lazy_mirror_error", {
          runId: effectiveRunId,
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
