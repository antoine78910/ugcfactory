export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { pollStudioGenerationRow, STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";
import { markStaleInProgressStudioGenerationsFailedAll } from "@/lib/studioGenerationsStale";
import { serverLog } from "@/lib/serverLog";

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
      .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
      .eq("uses_personal_api", false)
      .limit(150);

    if (error) throw error;

    let pollErrors = 0;
    for (const row of (rows ?? []) as StudioGenerationRow[]) {
      try {
        await pollStudioGenerationRow(row, undefined, undefined, admin);
      } catch {
        pollErrors++;
      }
    }

    const n = (rows ?? []).length;

    const stale = await markStaleInProgressStudioGenerationsFailedAll(admin);
    if (stale.count > 0) {
      serverLog("studio_generations_stale_expired", { count: stale.count });
    }

    if (n > 0 || pollErrors > 0 || stale.count > 0) {
      serverLog("studio_generations_cron_tick", { polled: n, pollErrors, staleExpired: stale.count });
    }
    return NextResponse.json({
      polled: n,
      pollErrors,
      staleExpired: stale.count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
