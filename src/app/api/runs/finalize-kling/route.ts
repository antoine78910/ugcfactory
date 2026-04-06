export const runtime = "nodejs";
/** Poll KIE until the video is ready (user may have left the page during generation). */
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
  parseKieResultMediaUrls,
} from "@/lib/kieMarket";
import { isPiapiTaskId, piapiGetSeedanceTask, piapiTaskStatusToLegacy } from "@/lib/piapiSeedance";
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
    return NextResponse.json({ error: "No pending video task on this run." }, { status: 400 });
  }
  const { angleIndex, refIndex, taskId, clipPart } = pending;

  const sleepMs = 4000;
  const maxWaitMs = 14 * 60 * 1000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    let vUrl = "";
    let failedMessage = "";
    let done = false;
    try {
      if (isPiapiTaskId(taskId)) {
        const data = await piapiGetSeedanceTask(taskId);
        const mapped = piapiTaskStatusToLegacy(data);
        if (mapped.status === "SUCCESS") {
          vUrl = mapped.response[0] ?? "";
          done = true;
        } else if (mapped.status === "FAILED") {
          failedMessage = mapped.error_message ?? "Video generation failed.";
        }
      } else {
        const data = await kieMarketRecordInfo(taskId);
        if (kieRecordStateIsSuccess(data.state)) {
          const urls = parseKieResultMediaUrls(data.resultJson);
          vUrl = urls[0] ?? "";
          done = true;
        } else if (kieRecordStateIsFail(data.state)) {
          failedMessage = data.failMsg ?? "Video generation failed.";
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Provider poll failed";
      // Transient network / provider blip: keep polling instead of failing the whole request.
      const transient =
        /fetch|network|timeout|econnreset|econnrefused|socket|502|503|504/i.test(message) ||
        /failed to fetch/i.test(message);
      if (transient) {
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (done) {
      if (!vUrl) {
        return NextResponse.json({ error: "Task succeeded but no video URL in result." }, { status: 502 });
      }

      const nextSnap = snapshotAfterKlingVideoSuccessForAngle(
        snap,
        angleIndex,
        refIndex,
        vUrl,
        taskId,
        clipPart,
      );
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

    if (failedMessage) {
      return NextResponse.json(
        { error: failedMessage, failed: true },
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
