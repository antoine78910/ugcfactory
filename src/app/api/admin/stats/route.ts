export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const [genRes, runsRes, usersRes] = await Promise.all([
    admin.from("studio_generations").select("id", { count: "exact", head: true }),
    admin.from("ugc_runs").select("id", { count: "exact", head: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
  ]);

  const totalGenerations = genRes.count ?? 0;
  const totalRuns = runsRes.count ?? 0;
  const totalUsers = usersRes.data?.users ? (usersRes as unknown as { data: { total: number } }).data.total ?? 0 : 0;

  // Credits stats
  const { data: creditRows } = await admin
    .from("studio_generations")
    .select("credits_charged,status");

  let totalCreditsSpent = 0;
  let readyCount = 0;
  let failedCount = 0;
  let processingCount = 0;
  if (creditRows) {
    for (const r of creditRows) {
      totalCreditsSpent += (r as { credits_charged: number }).credits_charged ?? 0;
      const s = (r as { status: string }).status;
      if (s === "ready") readyCount++;
      else if (s === "failed") failedCount++;
      else processingCount++;
    }
  }

  // Kind breakdown
  const kindMap: Record<string, number> = {};
  if (creditRows) {
    for (const r of creditRows as { kind?: string }[]) {
      const k = (r as unknown as { kind: string }).kind ?? "unknown";
      kindMap[k] = (kindMap[k] ?? 0) + 1;
    }
  }

  // Need kind in query too
  const { data: kindRows } = await admin
    .from("studio_generations")
    .select("kind");
  const kindBreakdown: Record<string, number> = {};
  if (kindRows) {
    for (const r of kindRows) {
      const k = (r as { kind: string }).kind ?? "unknown";
      kindBreakdown[k] = (kindBreakdown[k] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    totalGenerations,
    totalRuns,
    totalUsers,
    totalCreditsSpent,
    statusBreakdown: { ready: readyCount, failed: failedCount, processing: processingCount },
    kindBreakdown,
  });
}
