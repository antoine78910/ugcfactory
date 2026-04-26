export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { backfillEphemeralUgcRunMedia } from "@/lib/studioGenerationsMediaLifecycle";

/**
 * Admin trigger to force-run the `ugc_runs` ephemeral-media backfill RIGHT NOW
 * (instead of waiting for the next cron tick). Useful immediately after the
 * mirroring fix is shipped, to clean up legacy rows whose URLs may already
 * have started expiring on third-party CDNs.
 *
 * POST { limit?: number }   default 200, capped at 1000.
 */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  let limit = 200;
  try {
    const body = (await req.json().catch(() => null)) as { limit?: number } | null;
    if (body && typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(1000, Math.max(1, Math.floor(body.limit)));
    }
  } catch {
    /* ignore body parse errors */
  }

  try {
    const result = await backfillEphemeralUgcRunMedia(admin, limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
