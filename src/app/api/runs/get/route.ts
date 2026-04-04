export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isPostgrestNoRows, supabaseErrMessage } from "@/lib/supabaseErrMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function GET(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const runId = (searchParams.get("runId") ?? "").trim();
  if (!runId) return NextResponse.json({ error: "Missing `runId`." }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("ugc_runs")
      .select("*")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();
    if (error) {
      if (isPostgrestNoRows(error)) {
        return NextResponse.json({ error: "Run not found or access denied." }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch (err) {
    const message = supabaseErrMessage(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

