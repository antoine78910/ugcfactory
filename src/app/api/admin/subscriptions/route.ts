export const runtime = "nodejs";

/**
 * Admin endpoint: list all subscriptions in the DB.
 * GET /api/admin/subscriptions
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: rows, error } = await admin
    .from("user_subscriptions")
    .select("user_id, plan_id, billing, status, stripe_subscription_id, stripe_customer_id, current_period_end, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with emails
  const userIds = (rows ?? []).map((r) => (r as Record<string, unknown>).user_id as string);
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersData?.users) {
      for (const u of usersData.users) {
        if (userIds.includes(u.id)) emailMap[u.id] = u.email ?? u.id;
      }
    }
  }

  const enriched = (rows ?? []).map((r) => ({
    ...(r as Record<string, unknown>),
    email: emailMap[(r as Record<string, unknown>).user_id as string] ?? null,
  }));

  return NextResponse.json({ total: enriched.length, rows: enriched });
}
