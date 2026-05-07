export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { normalizeResultUrls } from "@/lib/studioGenerationsMap";

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

type StudioGenerationFallbackRow = {
  id: string;
  kind: string;
  label: string | null;
  model: string | null;
  external_task_id: string | null;
  result_urls: unknown;
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

function isMissingRecreationsTableError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("could not find the table") && m.includes("intelligence_recreations");
}

function mapStudioRowToRecreation(r: StudioGenerationFallbackRow): IntelligenceRecreation {
  const resultUrls = normalizeResultUrls(r.result_urls);
  return {
    id: r.id,
    kind: "ad_recreate",
    sourceAdId: null,
    sourceBrand: null,
    sourcePlatform: null,
    sourceHook: null,
    prompt: typeof r.label === "string" ? r.label : null,
    model: r.model,
    taskId: r.external_task_id,
    outputVideoUrl: resultUrls[0] ?? null,
    meta: { fallbackSource: "studio_generations" },
    createdAt: r.created_at,
  };
}

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

  if (error) {
    // Production-safe fallback while the dedicated migration may not be applied yet.
    if (isMissingRecreationsTableError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("studio_generations")
        .select("id, kind, label, model, external_task_id, result_urls, created_at")
        .eq("kind", "intelligence_video")
        .order("created_at", { ascending: false })
        .limit(200);
      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      const out = ((fallbackData ?? []) as StudioGenerationFallbackRow[]).map(mapStudioRowToRecreation);
      return NextResponse.json(out);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

  if (error) {
    // If migration is missing in prod, return a fallback item from studio_generations
    // so recreations still appear in the panel.
    if (isMissingRecreationsTableError(error)) {
      const taskId = payload.task_id;
      if (taskId) {
        const { data: fb, error: fbError } = await supabase
          .from("studio_generations")
          .select("id, kind, label, model, external_task_id, result_urls, created_at")
          .eq("kind", "intelligence_video")
          .eq("external_task_id", taskId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!fbError && fb) return NextResponse.json(mapStudioRowToRecreation(fb as StudioGenerationFallbackRow), { status: 202 });
      }
      return NextResponse.json(
        {
          ok: true,
          warning: "intelligence_recreations table missing; using studio_generations fallback",
        },
        { status: 202 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

