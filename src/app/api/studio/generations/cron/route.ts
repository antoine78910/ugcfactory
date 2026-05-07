export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { pollStudioGenerationRow, STUDIO_GENERATION_IN_PROGRESS_STATUSES } from "@/lib/studioGenerationsPoll";
import { markStaleInProgressStudioGenerationsFailedAll } from "@/lib/studioGenerationsStale";
import {
  applyStudioMediaRetention,
  backfillEphemeralStudioResults,
  backfillEphemeralUgcRunMedia,
} from "@/lib/studioGenerationsMediaLifecycle";
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

  // Use constant-time comparison to prevent timing attacks
  let authorized = false;
  try {
    const { timingSafeEqual } = await import("node:crypto");
    const a = Buffer.from(bearer);
    const b = Buffer.from(secret);
    authorized = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    authorized = false;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 503 });
  }

  try {
    // Prioritize upscales first (these are long-running and frequently reported as "stuck generating").
    const cutoff2hIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const [{ data: upscaleRows, error: upscaleErr }, { data: otherRows, error: otherErr }] = await Promise.all([
      admin
        .from("studio_generations")
        .select("*")
        .eq("kind", "studio_upscale")
        .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
        .eq("uses_personal_api", false)
        .gte("created_at", cutoff2hIso)
        .order("created_at", { ascending: true })
        .limit(120),
      admin
        .from("studio_generations")
        .select("*")
        .neq("kind", "studio_upscale")
        .in("status", [...STUDIO_GENERATION_IN_PROGRESS_STATUSES])
        .eq("uses_personal_api", false)
        .order("created_at", { ascending: true })
        .limit(80),
    ]);

    if (upscaleErr) throw upscaleErr;
    if (otherErr) throw otherErr;

    const rows = [...(upscaleRows ?? []), ...(otherRows ?? [])] as StudioGenerationRow[];

    let pollErrors = 0;
    // Cron has a fatter budget (3008 MB) and processes rows sequentially,
    // so we let it archive everything inline rather than only the ephemeral
    // subset (no risk of taking down concurrent web traffic).
    for (const row of rows) {
      try {
        await pollStudioGenerationRow(row, undefined, undefined, admin, { mode: "cron" });
      } catch {
        pollErrors++;
      }
    }

    const n = rows.length;

    const stale = await markStaleInProgressStudioGenerationsFailedAll(admin);
    if (stale.count > 0) {
      serverLog("studio_generations_stale_expired", { count: stale.count });
    }

    let backfillUpdated = 0;
    let runsBackfillUpdated = 0;
    let runsBackfillMirroredUrls = 0;
    let retentionPurged = 0;
    try {
      const bf = await backfillEphemeralStudioResults(admin, 50);
      backfillUpdated = bf.updated;
    } catch (e) {
      serverLog("studio_media_backfill_error", { message: e instanceof Error ? e.message : String(e) });
    }
    try {
      const rb = await backfillEphemeralUgcRunMedia(admin, 30);
      runsBackfillUpdated = rb.updated;
      runsBackfillMirroredUrls = rb.mirroredUrls;
    } catch (e) {
      serverLog("ugc_run_media_backfill_cron_error", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
    try {
      const rt = await applyStudioMediaRetention(admin, 40);
      retentionPurged = rt.purged;
    } catch (e) {
      serverLog("studio_media_retention_error", { message: e instanceof Error ? e.message : String(e) });
    }

    if (
      n > 0 ||
      pollErrors > 0 ||
      stale.count > 0 ||
      backfillUpdated > 0 ||
      runsBackfillUpdated > 0 ||
      retentionPurged > 0
    ) {
      serverLog("studio_generations_cron_tick", {
        polled: n,
        pollErrors,
        staleExpired: stale.count,
        backfillUpdated,
        runsBackfillUpdated,
        runsBackfillMirroredUrls,
        retentionPurged,
      });
    }
    return NextResponse.json({
      polled: n,
      pollErrors,
      staleExpired: stale.count,
      backfillUpdated,
      runsBackfillUpdated,
      runsBackfillMirroredUrls,
      retentionPurged,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
