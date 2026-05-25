export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/** Normalized store URLs marked as Template in My Projects (template-recording users only). */
export async function GET() {
  const auth = await requireLtaTemplateRecordingUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ normalizedUrls: [] as string[] });
  }

  try {
    const { data: rows, error } = await admin
      .from("lta_template_brands")
      .select("normalized_url")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("relation") && msg.includes("does not exist")) {
        return NextResponse.json({ normalizedUrls: [] as string[] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const normalizedUrls: string[] = [];
    for (const row of rows ?? []) {
      const url = typeof row.normalized_url === "string" ? row.normalized_url.trim().toLowerCase() : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      normalizedUrls.push(url);
    }
    return NextResponse.json({ normalizedUrls });
  } catch {
    return NextResponse.json({ normalizedUrls: [] as string[] });
  }
}
