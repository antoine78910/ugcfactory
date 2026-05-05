export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ledgerTicksToDisplayCredits } from "@/lib/creditLedgerTicks";
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
      const ticks = (r as { credits_charged: number }).credits_charged ?? 0;
      totalCreditsSpent += ledgerTicksToDisplayCredits(ticks);
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: last30 } = await admin
    .from("studio_generations")
    .select("credits_charged,user_id,status")
    .gte("created_at", thirtyDaysAgo);

  let creditsSpent30d = 0;
  const perUser = new Map<string, number>();
  let total30 = 0;
  let failed30 = 0;
  for (const r of last30 ?? []) {
    const ticks = (r as { credits_charged: number }).credits_charged ?? 0;
    const display = ledgerTicksToDisplayCredits(ticks);
    creditsSpent30d += display;
    const uid = (r as { user_id: string }).user_id;
    perUser.set(uid, (perUser.get(uid) ?? 0) + display);
    total30 += 1;
    if ((r as { status: string }).status === "failed") failed30 += 1;
  }

  const failureRatePct = total30 > 0 ? Math.round((failed30 / total30) * 1000) / 10 : 0;

  const topUserIds = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topUsersBySpend: Array<{ user_id: string; email: string; total: number }> = [];
  if (topUserIds.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map<string, string>();
    for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? u.id);
    for (const [uid, totalSpent] of topUserIds) {
      topUsersBySpend.push({
        user_id: uid,
        email: emailById.get(uid) ?? uid.slice(0, 8),
        total: Math.round(totalSpent * 10) / 10,
      });
    }
  }

  return NextResponse.json({
    totalGenerations,
    totalRuns,
    totalUsers,
    totalCreditsSpent,
    statusBreakdown: { ready: readyCount, failed: failedCount, processing: processingCount },
    kindBreakdown,
    creditsSpent30d,
    topUsersBySpend,
    failureRatePct,
  });
}
