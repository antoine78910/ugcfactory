export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";
import {
  isEphemeralOrUnstableMediaUrl,
  isStudioMediaPublicUrl,
  persistStudioMediaUrls,
} from "@/lib/studioGenerationsMedia";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { isMissingCompletedAtColumnError, isMissingCreditBalanceAfterColumnError } from "@/lib/studioGenerationsSchemaCompat";

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

  const { data: matchRows } = await supabase
    .from("studio_generations")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("external_task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1);
  const matchRow = matchRows?.[0];
  const rowId = (matchRow?.id as string | undefined) ?? `task-${taskId.slice(0, 80)}`;
  const inProgress = (STUDIO_GENERATION_IN_PROGRESS_STATUSES as readonly string[]).includes(
    String(matchRow?.status ?? ""),
  );

  let finalUrl = resultUrl;
  if (!isStudioMediaPublicUrl(resultUrl) && isEphemeralOrUnstableMediaUrl(resultUrl)) {
    const admin = createSupabaseServiceClient();
    if (admin) {
      try {
        // Copy Kie tempfile / other short-lived image URLs into studio-media before
        // the workflow stores them. Videos stay on the provider URL for the cron.
        const { urls } = await persistStudioMediaUrls({
          admin,
          userId: user.id,
          rowId,
          urls: [resultUrl],
          mode: "live",
        });
        if (urls[0] && isStudioMediaPublicUrl(urls[0])) finalUrl = urls[0];
      } catch (e) {
        console.error("[completeStudioTask] archival failed, keeping original URL:", e);
      }
    }
  }

  if (matchRow?.id && !inProgress && isStudioMediaPublicUrl(finalUrl)) {
    await supabase.from("studio_generations").update({ result_urls: [finalUrl] }).eq("id", matchRow.id);
  }

  // Snapshot balance after completion — at this point the client has already
  // called /api/me/credits/spend, so this reflects the true post-deduction balance.
  let creditBalanceAfter: number | undefined;
  const adminClient = createSupabaseServiceClient();
  if (adminClient) {
    try {
      const { balance } = await getUserCreditBalance(adminClient, user.id);
      creditBalanceAfter = Math.round(balance * 1000) / 1000;
    } catch {
      // non-fatal
    }
  }

  const completedAt = new Date().toISOString();
  let updatePayload: Record<string, unknown> = {
    status: "ready",
    result_urls: [finalUrl],
    error_message: null,
    completed_at: completedAt,
    ...(creditBalanceAfter !== undefined ? { credit_balance_after: creditBalanceAfter } : {}),
  };

  let { error } = await supabase
    .from("studio_generations")
    .update(updatePayload)
    .eq("user_id", user.id)
    .eq("external_task_id", taskId)
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]);

  // Graceful fallback: drop new columns if they don't exist in schema.
  if (error && isMissingCompletedAtColumnError(error.message) && "completed_at" in updatePayload) {
    const { completed_at: _c, ...rest } = updatePayload;
    updatePayload = rest;
    ({ error } = await supabase
      .from("studio_generations")
      .update(updatePayload)
      .eq("user_id", user.id)
      .eq("external_task_id", taskId)
      .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]));
  }
  if (error && isMissingCreditBalanceAfterColumnError(error.message) && "credit_balance_after" in updatePayload) {
    const { credit_balance_after: _b, ...rest } = updatePayload;
    updatePayload = rest;
    ({ error } = await supabase
      .from("studio_generations")
      .update(updatePayload)
      .eq("user_id", user.id)
      .eq("external_task_id", taskId)
      .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, archived: isStudioMediaPublicUrl(finalUrl), resultUrl: finalUrl });
}
