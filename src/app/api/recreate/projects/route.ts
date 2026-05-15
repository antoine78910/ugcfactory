export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import type { RecreateAnalyzeResponse } from "@/lib/recreateAnalysis";
import {
  emptySceneKeyframes,
  type RecreateProjectRow,
  type RecreateSceneKeyframes,
} from "@/lib/recreateProjects";

function initialKeyframesFromAnalysis(analysis: RecreateAnalyzeResponse): Record<string, RecreateSceneKeyframes> {
  const out: Record<string, RecreateSceneKeyframes> = {};
  for (const s of analysis.scenes ?? []) {
    if (s.sceneId) out[s.sceneId] = emptySceneKeyframes();
  }
  return out;
}

export async function GET(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("all") === "1";

  let q = supabase
    .from("recreate_projects")
    .select(
      "id, title, status, video_url, video_file_name, duration_sec, updated_at, created_at, product_image_url",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (!includeArchived) {
    q = q.eq("status", "in_progress");
  }

  const { data, error } = await q;
  if (error) {
    if (/recreate_projects/.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

type PostBody = {
  title?: unknown;
  videoUrl?: unknown;
  videoFileName?: unknown;
  durationSec?: unknown;
  analysis?: unknown;
};

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const analysis = body.analysis as RecreateAnalyzeResponse | null;
  if (!analysis || !Array.isArray(analysis.scenes) || analysis.scenes.length === 0) {
    return NextResponse.json({ error: "Missing `analysis` with at least one scene." }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : typeof body.videoFileName === "string" && body.videoFileName.trim()
        ? body.videoFileName.trim().slice(0, 200)
        : "Recreate project";

  const videoUrl =
    typeof body.videoUrl === "string" && /^https?:\/\//i.test(body.videoUrl.trim())
      ? body.videoUrl.trim()
      : null;
  const videoFileName = typeof body.videoFileName === "string" ? body.videoFileName.trim().slice(0, 500) : null;
  const durationSec =
    typeof body.durationSec === "number" && Number.isFinite(body.durationSec) ? body.durationSec : null;

  const keyframes_json = initialKeyframesFromAnalysis(analysis);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("recreate_projects")
    .insert({
      user_id: user.id,
      title,
      status: "in_progress",
      video_url: videoUrl,
      video_file_name: videoFileName,
      duration_sec: durationSec,
      analysis_json: analysis,
      keyframes_json,
      client_state_json: {},
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (/recreate_projects/.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Database table recreate_projects is missing. Apply the latest Supabase migration." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as RecreateProjectRow);
}
