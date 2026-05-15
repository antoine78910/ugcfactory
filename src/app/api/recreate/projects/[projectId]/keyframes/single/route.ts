export const runtime = "nodejs";
export const maxDuration = 180;

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createStudioKieImageTasks } from "@/lib/studioKieImageTask";
import { pollKieMarketImageTaskForUrls } from "@/lib/recreateKieImagePoll";
import {
  isStudioImageKiePickerModelId,
  resolveStudioImageModelForReferences,
} from "@/lib/studioImageModels";
import type { RecreateAnalyzeResponse, RecreateScene } from "@/lib/recreateAnalysis";
import {
  buildRecreateKeyframeGeneration,
  emptySceneKeyframes,
  resolveFrameProductUrl,
  type RecreateSceneKeyframes,
} from "@/lib/recreateProjects";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  sceneId?: unknown;
  role?: unknown;
  force?: unknown;
  imageModel?: unknown;
};

function collectRefUrls(urls: Array<string | null | undefined>, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const v = (raw ?? "").trim();
    if (!v || !/^https?:\/\//i.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  if (!getEnv("KIE_API_KEY")?.trim()) {
    return NextResponse.json(
      { error: "KIE_API_KEY is not configured. GPT Image 2 runs through Kie Market on the server." },
      { status: 503 },
    );
  }

  const { projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sceneId = typeof body.sceneId === "string" ? body.sceneId.trim() : "";
  const role = body.role === "end" ? "end" : "start";
  const force = body.force === true;
  const imageModelRaw = typeof body.imageModel === "string" ? body.imageModel.trim() : "gpt_image_2";
  const imagePickerId = isStudioImageKiePickerModelId(imageModelRaw) ? imageModelRaw : "gpt_image_2";
  const resolvedImageModel = resolveStudioImageModelForReferences(imagePickerId, true);

  if (!sceneId) return NextResponse.json({ error: "Missing sceneId." }, { status: 400 });

  const { data: row, error: loadErr } = await supabase
    .from("recreate_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const projectProductUrl = (row.product_image_url as string | null)?.trim() ?? "";

  const analysis = row.analysis_json as RecreateAnalyzeResponse;
  const scenes = Array.isArray(analysis?.scenes) ? (analysis.scenes as RecreateScene[]) : [];
  const scene = scenes.find((s) => s.sceneId === sceneId);
  if (!scene) return NextResponse.json({ error: "Unknown sceneId for this project." }, { status: 400 });

  const baseFrame =
    role === "start" ? scene.sceneStartImageUrl?.trim() ?? "" : scene.sceneEndImageUrl?.trim() ?? "";
  if (!/^https?:\/\//i.test(baseFrame)) {
    return NextResponse.json(
      {
        error:
          "This project is missing public start/end frame URLs. Re-run video analysis with SUPABASE_SERVICE_ROLE_KEY configured so scene frames can be stored.",
      },
      { status: 400 },
    );
  }

  const packaging = (row.packaging_image_url as string | null)?.trim() ?? "";
  const logo = (row.logo_image_url as string | null)?.trim() ?? "";

  const keyframesRaw = (row.keyframes_json ?? {}) as Record<string, RecreateSceneKeyframes>;
  const slotPath = keyframesRaw[sceneId] ?? emptySceneKeyframes();
  const slot = role === "start" ? slotPath.start : slotPath.end;

  const productUrl = resolveFrameProductUrl(slot, projectProductUrl);
  if (!productUrl) {
    return NextResponse.json(
      {
        error:
          "Upload a product photo for this frame (or set a default product on the project) before generating.",
      },
      { status: 400 },
    );
  }
  if (!force && slot.status === "ready" && slot.outputUrl) {
    return NextResponse.json({
      sceneId,
      role,
      outputUrl: slot.outputUrl,
      cached: true,
    });
  }

  const { prompt, imageUrls } = buildRecreateKeyframeGeneration({
    scene,
    role,
    sceneFrameUrl: baseFrame,
    productUrl,
    packagingUrl: packaging || null,
    logoUrl: logo || null,
  });
  const safeImageUrls = collectRefUrls(imageUrls, 16);

  let taskId: string | undefined;
  try {
    const created = await createStudioKieImageTasks({
      prompt,
      model: resolvedImageModel,
      imageUrls: safeImageUrls,
      aspectRatio: "auto",
    });
    taskId = created.taskId ?? created.taskIds?.[0];
    if (!taskId) throw new Error("Provider returned no task id.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image task failed to start.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let urls: string[] = [];
  try {
    urls = await pollKieMarketImageTaskForUrls({ taskId, maxWaitMs: 170_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image generation failed.";
    return NextResponse.json({ error: msg, taskId }, { status: 502 });
  }

  const outputUrl = urls[0] ?? "";
  if (!outputUrl) return NextResponse.json({ error: "No output image URL returned.", taskId }, { status: 502 });

  const nextKeyframes = { ...keyframesRaw } as Record<string, RecreateSceneKeyframes>;
  const prev = nextKeyframes[sceneId] ?? emptySceneKeyframes();
  const now = new Date().toISOString();
  nextKeyframes[sceneId] =
    role === "start"
      ? {
          ...prev,
          start: { status: "ready", taskId, outputUrl, updatedAt: now },
          end: prev.end,
        }
      : {
          ...prev,
          start: prev.start,
          end: { status: "ready", taskId, outputUrl, updatedAt: now },
        };

  const { data: updated, error: saveErr } = await supabase
    .from("recreate_projects")
    .update({ keyframes_json: nextKeyframes, updated_at: now })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("id, keyframes_json")
    .maybeSingle();

  if (saveErr) return NextResponse.json({ error: saveErr.message, outputUrl }, { status: 500 });

  return NextResponse.json({
    sceneId,
    role,
    outputUrl,
    taskId,
    project: updated,
  });
}
