export const runtime = "nodejs";
/** Poll KIE until the video is ready (user may have left the page during generation). */
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { kieMarketRecordInfo, parseResultUrls } from "@/lib/kieMarket";
import {
  cloneExtractedBase,
  findPendingKlingInUniverse,
  normalizePipelineByAngle,
  readUniverseFromExtracted,
  snapshotAfterKlingVideoSuccessForAngle,
  universeHasPendingKlingTask,
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

  if (!universeHasPendingKlingTask(snap)) {
    const triple = normalizePipelineByAngle(snap);
    let videoUrl = snap.klingVideoUrl?.trim() || "";
    if (!videoUrl) {
      outer: for (const pipe of triple) {
        const slots = pipe.klingByReferenceIndex;
        if (!Array.isArray(slots)) continue;
        for (const s of slots) {
          const v = typeof s.videoUrl === "string" ? s.videoUrl.trim() : "";
          if (v) {
            videoUrl = v;
            break outer;
          }
        }
      }
    }
    return NextResponse.json({
      ok: true,
      ...(videoUrl ? { videoUrl } : {}),
      alreadyFinalized: true,
    });
  }

  const pending = findPendingKlingInUniverse(snap);
  if (!pending) {
    return NextResponse.json({ error: "No pending Kling/KIE task on this run." }, { status: 400 });
  }
  const { angleIndex, refIndex, taskId } = pending;

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

      const nextSnap = snapshotAfterKlingVideoSuccessForAngle(snap, angleIndex, refIndex, vUrl, taskId);
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
      message: "Video still processing. Open Link to Ad or refresh My Projects in a moment.",
    },
    { status: 202 },
  );
}
