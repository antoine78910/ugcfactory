export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { pollStudioGenerationRow } from "@/lib/studioGenerationsPoll";

/**
 * Railway / external cron: poll platform-key studio jobs so generation completes if the user closed the tab.
 * Configure HTTP POST every 30–60s with header:
 *   Authorization: Bearer <STUDIO_GENERATIONS_CRON_SECRET>
 */
export async function POST(req: Request) {
  const secret = getEnv("STUDIO_GENERATIONS_CRON_SECRET")?.trim();
  if (!secret) {
    return NextResponse.json({ error: "STUDIO_GENERATIONS_CRON_SECRET not configured." }, { status: 503 });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 503 });
  }

  try {
    const { data: rows, error } = await admin
      .from("studio_generations")
      .select("*")
      .eq("status", "processing")
      .eq("uses_personal_api", false)
      .limit(150);

    if (error) throw error;

    let pollErrors = 0;
    for (const row of (rows ?? []) as StudioGenerationRow[]) {
      try {
        await pollStudioGenerationRow(row, undefined, admin);
      } catch {
        pollErrors++;
      }
    }

    return NextResponse.json({
      polled: (rows ?? []).length,
      pollErrors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
