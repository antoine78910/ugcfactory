export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { getUserCreditBalance } from "@/lib/creditGrants";

export type AdminOnboardingRow = {
  user_id: string;
  email: string;
  work_type: string | null;
  referral_source: string | null;
  completed_at: string;
  created_at: string;
  plan_id: string | null;
  sub_status: string | null;
  is_subscriber: boolean;
  trial_active: boolean;
  credit_balance: number | null;
};

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? "50") || 50));
  const search = url.searchParams.get("q")?.trim() || null;

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("user_onboarding")
    .select("user_id, work_type, referral_source, completed_at, created_at", { count: "exact" })
    .order("completed_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`work_type.ilike.%${search}%,referral_source.ilike.%${search}%`);
  }

  const { data: rows, error, count } = await query;

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("relation") && msg.includes("does not exist")) {
      return NextResponse.json({
        rows: [] as AdminOnboardingRow[],
        total: 0,
        warning: "Table user_onboarding not found. Run the SQL migration in Supabase.",
      });
    }
    console.error("[admin/onboarding]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = (rows ?? []) as Array<{
    user_id: string;
    work_type: string | null;
    referral_source: string | null;
    completed_at: string;
    created_at: string;
  }>;

  const userIds = [...new Set(raw.map((r) => r.user_id))];

  const emailByUser = new Map<string, string>();
  const trialByUser = new Map<string, boolean>();

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data, error: uErr } = await admin.auth.admin.getUserById(uid);
        if (uErr || !data?.user) return;
        const email = data.user.email?.trim() ?? "";
        emailByUser.set(uid, email);
        const meta = data.user.app_metadata as Record<string, unknown> | undefined;
        trialByUser.set(uid, meta?.trial_active === true);
      } catch {
        /* ignore */
      }
    }),
  );

  const subByUser = new Map<string, { plan_id: string; status: string }>();
  if (userIds.length > 0) {
    const { data: subs } = await admin.from("user_subscriptions").select("user_id, plan_id, status").in("user_id", userIds);
    for (const s of subs ?? []) {
      const row = s as { user_id: string; plan_id: string | null; status: string | null };
      if (row.user_id && row.plan_id) {
        subByUser.set(row.user_id, { plan_id: row.plan_id, status: row.status ?? "" });
      }
    }
  }

  const balanceByUser = new Map<string, number>();
  if (userIds.length > 0) {
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const b = await getUserCreditBalance(admin, uid);
          balanceByUser.set(uid, b.balance);
        } catch {
          balanceByUser.set(uid, 0);
        }
      }),
    );
  }

  const enriched: AdminOnboardingRow[] = raw.map((r) => {
    const sub = subByUser.get(r.user_id);
    const status = sub?.status ?? null;
    const isSubscriber = status === "active" || status === "trialing";
    return {
      user_id: r.user_id,
      email: emailByUser.get(r.user_id) ?? "",
      work_type: r.work_type,
      referral_source: r.referral_source,
      completed_at: r.completed_at,
      created_at: r.created_at,
      plan_id: sub?.plan_id ?? null,
      sub_status: status,
      is_subscriber: isSubscriber,
      trial_active: trialByUser.get(r.user_id) ?? false,
      credit_balance: balanceByUser.has(r.user_id) ? balanceByUser.get(r.user_id)! : null,
    };
  });

  return NextResponse.json({
    rows: enriched,
    total: count ?? enriched.length,
  });
}
