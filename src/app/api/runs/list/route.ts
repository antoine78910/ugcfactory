export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function GET() {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const { data, error } = await supabase
      .from("ugc_runs")
      .select("id, created_at, store_url, title, selected_image_url, video_url, generated_image_urls")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

