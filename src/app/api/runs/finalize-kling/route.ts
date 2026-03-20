export const runtime = "nodejs";
/** Poll KIE until the video is ready (user may have left the page during generation). */
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { kieMarketRecordInfo, parseResultUrls } from "@/lib/kieMarket";
import {
  cloneExtractedBase,
  readUniverseFromExtracted,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";

type Body = { runId?: string };

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return NextResponse.json({ error: "Missing `runId`." }, { status: 400 });
  }

  const { data: run, error: loadErr } = await supabase
    .from("ugc_runs")
    .select("id, extracted")
    .eq("id", runId)
    .eq("user_id", user.id)
    .single();

  if (loadErr || !run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  const snap = readUniverseFromExtracted(run.extracted);
  if (!snap) {
    return NextResponse.json({ error: "Not a Link to Ad run." }, { status: 400 });
  }

  if (snap.klingVideoUrl?.trim()) {
    return NextResponse.json({
      ok: true,
      videoUrl: snap.klingVideoUrl.trim(),
      alreadyFinalized: true,
    });
  }

  const taskId = snap.klingTaskId?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "No pending Kling/KIE task on this run." }, { status: 400 });
  }

  const sleepMs = 4000;
  const maxWaitMs = 14 * 60 * 1000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    let data: Awaited<ReturnType<typeof kieMarketRecordInfo>>;
    try {
      data = await kieMarketRecordInfo(taskId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "KIE poll failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (data.state === "success") {
      const urls = parseResultUrls(data.resultJson);
      const vUrl = urls[0];
      if (!vUrl) {
        return NextResponse.json({ error: "Task succeeded but no video URL in result." }, { status: 502 });
      }

      const nextSnap: LinkToAdUniverseSnapshotV1 = {
        ...snap,
        klingVideoUrl: vUrl,
        klingTaskId: taskId,
      };
      const base = cloneExtractedBase(run.extracted);
      const extracted = { ...base, __universe: nextSnap };

      const { error: upErr } = await supabase
        .from("ugc_runs")
        .update({
          extracted,
          video_url: vUrl,
        })
        .eq("id", runId)
        .eq("user_id", user.id);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 502 });
      }

      return NextResponse.json({ ok: true, videoUrl: vUrl });
    }

    if (data.state === "fail") {
      return NextResponse.json(
        { error: data.failMsg ?? "Video generation failed.", failed: true },
        { status: 502 },
      );
    }

    await new Promise((r) => setTimeout(r, sleepMs));
  }

  return NextResponse.json(
    {
      ok: false,
      pending: true,
      message: "Video still processing — open Link to Ad or refresh Projects in a moment.",
    },
    { status: 202 },
  );
}
