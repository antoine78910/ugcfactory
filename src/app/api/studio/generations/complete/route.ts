export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";
import { persistStudioMediaUrls, isStudioMediaPublicUrl } from "@/lib/studioGenerationsMedia";

type Body = {
  taskId: string;
  resultUrl: string;
};

/**
 * Called by the client immediately after pollKlingVideo / pollVeoVideo returns a URL.
 * Archives the media to Supabase Storage (`studio-media`) so ephemeral provider URLs
 * are replaced by permanent ones. Falls back to saving the original URL if archival fails
 * (cron backfill will retry later).
 */
export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = String(body.taskId ?? "").trim();
  const resultUrl = String(body.resultUrl ?? "").trim();

  if (!taskId || !resultUrl) {
    return NextResponse.json({ error: "Missing taskId or resultUrl" }, { status: 400 });
  }

  const { data: matchRow } = await supabase
    .from("studio_generations")
    .select("id")
    .eq("user_id", user.id)
    .eq("external_task_id", taskId)
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
    .maybeSingle();

  const rowId = matchRow?.id as string | undefined;

  let finalUrl = resultUrl;
  if (!isStudioMediaPublicUrl(resultUrl) && rowId) {
    const admin = createSupabaseServiceClient();
    if (admin) {
      try {
        const { urls, complete } = await persistStudioMediaUrls({
          admin,
          userId: user.id,
          rowId,
          urls: [resultUrl],
        });
        if (complete && urls[0]) finalUrl = urls[0];
        else if (urls[0] && isStudioMediaPublicUrl(urls[0])) finalUrl = urls[0];
      } catch (e) {
        console.error("[completeStudioTask] archival failed, keeping original URL:", e);
      }
    }
  }

  const { error } = await supabase
    .from("studio_generations")
    .update({
      status: "ready",
      result_urls: [finalUrl],
      error_message: null,
    })
    .eq("user_id", user.id)
    .eq("external_task_id", taskId)
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, archived: isStudioMediaPublicUrl(finalUrl) });
}
