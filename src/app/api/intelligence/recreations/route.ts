export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type RecreationRow = {
  id: string;
  kind: string;
  source_ad_id: string | null;
  source_brand: string | null;
  source_platform: string | null;
  source_hook: string | null;
  prompt: string | null;
  model: string | null;
  task_id: string | null;
  output_video_url: string | null;
  meta: unknown;
  created_at: string;
};

export type IntelligenceRecreation = {
  id: string;
  kind: string;
  sourceAdId: string | null;
  sourceBrand: string | null;
  sourcePlatform: string | null;
  sourceHook: string | null;
  prompt: string | null;
  model: string | null;
  taskId: string | null;
  outputVideoUrl: string | null;
  meta: unknown;
  createdAt: string;
};

export async function GET() {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("intelligence_recreations")
    .select(
      "id, kind, source_ad_id, source_brand, source_platform, source_hook, prompt, model, task_id, output_video_url, meta, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as RecreationRow[];
  const out: IntelligenceRecreation[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    sourceAdId: r.source_ad_id,
    sourceBrand: r.source_brand,
    sourcePlatform: r.source_platform,
    sourceHook: r.source_hook,
    prompt: r.prompt,
    model: r.model,
    taskId: r.task_id,
    outputVideoUrl: r.output_video_url,
    meta: r.meta,
    createdAt: r.created_at,
  }));
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<IntelligenceRecreation> & {
    kind?: unknown;
    sourceAdId?: unknown;
    sourceBrand?: unknown;
    sourcePlatform?: unknown;
    sourceHook?: unknown;
    prompt?: unknown;
    model?: unknown;
    taskId?: unknown;
    outputVideoUrl?: unknown;
    meta?: unknown;
  };

  const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim() : "ad_recreate";

  const payload = {
    user_id: user.id,
    kind,
    source_ad_id: typeof body.sourceAdId === "string" ? body.sourceAdId.trim() : null,
    source_brand: typeof body.sourceBrand === "string" ? body.sourceBrand.trim() : null,
    source_platform: typeof body.sourcePlatform === "string" ? body.sourcePlatform.trim() : null,
    source_hook: typeof body.sourceHook === "string" ? body.sourceHook.trim() : null,
    prompt: typeof body.prompt === "string" ? body.prompt : null,
    model: typeof body.model === "string" ? body.model.trim() : null,
    task_id: typeof body.taskId === "string" ? body.taskId.trim() : null,
    output_video_url: typeof body.outputVideoUrl === "string" ? body.outputVideoUrl.trim() : null,
    meta: body.meta ?? null,
  };

  const { data, error } = await supabase
    .from("intelligence_recreations")
    .insert(payload)
    .select(
      "id, kind, source_ad_id, source_brand, source_platform, source_hook, prompt, model, task_id, output_video_url, meta, created_at",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as RecreationRow;
  return NextResponse.json({
    id: r.id,
    kind: r.kind,
    sourceAdId: r.source_ad_id,
    sourceBrand: r.source_brand,
    sourcePlatform: r.source_platform,
    sourceHook: r.source_hook,
    prompt: r.prompt,
    model: r.model,
    taskId: r.task_id,
    outputVideoUrl: r.output_video_url,
    meta: r.meta,
    createdAt: r.created_at,
  } satisfies IntelligenceRecreation);
}

