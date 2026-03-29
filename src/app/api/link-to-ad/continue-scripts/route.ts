export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createInternalFetchFromRequest } from "@/lib/linkToAd/internalFetch";
import { runContinueScriptsPipeline } from "@/lib/linkToAd/runInitialPipeline";

type Body = { runId?: string; videoDurationSeconds?: number };

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return NextResponse.json({ error: "Missing `runId`." }, { status: 400 });
  }

  const f = createInternalFetchFromRequest(req);
  const result = await runContinueScriptsPipeline(f, runId, {
    videoDurationSeconds: body?.videoDurationSeconds,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.runId ? { runId: result.runId } : {}) },
      { status: 502 },
    );
  }

  return NextResponse.json({ runId: result.runId, scriptsStepOk: result.scriptsStepOk });
}
