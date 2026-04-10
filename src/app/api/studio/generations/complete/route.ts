export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";

type Body = {
  taskId: string;
  resultUrl: string;
};

/**
 * Called by the client immediately after pollKlingVideo / pollVeoVideo returns a URL.
 * Guarantees the result URL is saved to Supabase without waiting for the server-side cron/poll.
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

  const { error } = await supabase
    .from("studio_generations")
    .update({
      status: "ready",
      result_urls: [resultUrl],
      error_message: null,
    })
    .eq("user_id", user.id)
    .eq("external_task_id", taskId)
    .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
