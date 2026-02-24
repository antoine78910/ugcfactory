export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  runId?: string;
  storeUrl?: string;
  title?: string | null;
  extracted?: unknown;
  analysis?: unknown;
  quiz?: unknown;
  packshotUrls?: string[];
  imagePrompt?: string;
  negativePrompt?: string;
  generatedImageUrls?: string[];
  selectedImageUrl?: string | null;
  videoTemplateId?: string | null;
  videoPrompt?: string;
  videoUrl?: string | null;
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload: any = {
    user_id: user.id,
  };
  if (typeof body.storeUrl === "string" && body.storeUrl.trim()) payload.store_url = body.storeUrl.trim();
  if (body.title === null || typeof body.title === "string") payload.title = body.title;
  if (body.extracted !== undefined) payload.extracted = body.extracted;
  if (body.analysis !== undefined) payload.analysis = body.analysis;
  if (body.quiz !== undefined) payload.quiz = body.quiz;
  if (Array.isArray(body.packshotUrls)) payload.packshot_urls = body.packshotUrls.filter(Boolean).slice(0, 12);
  if (typeof body.imagePrompt === "string") payload.image_prompt = body.imagePrompt;
  if (typeof body.negativePrompt === "string") payload.negative_prompt = body.negativePrompt;
  if (Array.isArray(body.generatedImageUrls)) payload.generated_image_urls = body.generatedImageUrls.filter(Boolean).slice(0, 12);
  if (body.selectedImageUrl === null || typeof body.selectedImageUrl === "string")
    payload.selected_image_url = body.selectedImageUrl;
  if (body.videoTemplateId === null || typeof body.videoTemplateId === "string")
    payload.video_template_id = body.videoTemplateId;
  if (typeof body.videoPrompt === "string") payload.video_prompt = body.videoPrompt;
  if (body.videoUrl === null || typeof body.videoUrl === "string") payload.video_url = body.videoUrl;

  try {
    if (typeof body.runId === "string" && body.runId.trim()) {
      const { data, error } = await supabase
        .from("ugc_runs")
        .update(payload)
        .eq("id", body.runId.trim())
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ runId: data.id });
    }

    if (!payload.store_url) {
      return NextResponse.json({ error: "Missing `storeUrl` for new run." }, { status: 400 });
    }

    const { data, error } = await supabase.from("ugc_runs").insert(payload).select("id").single();
    if (error) throw error;
    return NextResponse.json({ runId: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

