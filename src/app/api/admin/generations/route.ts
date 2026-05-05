export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

function deriveAppEndpoint(row: Record<string, unknown>): string {
  const kind = String(row.kind ?? "").trim().toLowerCase();
  // Prefer kind-based mapping (most reliable).
  if (kind === "studio_audio") return "/api/elevenlabs/speech-to-speech";
  if (kind === "studio_translate_video") return "/api/wavespeed/video-translate";
  if (kind === "motion_control") return "/api/kling/motion-control";
  if (
    kind === "studio_video" ||
    kind === "workflow_video" ||
    kind === "studio_watermark" ||
    kind === "link_to_ad_video"
  ) {
    return "/api/kling/generate";
  }
  if (kind === "link_to_ad_image") return "/api/nanobanana/generate";
  if (kind === "studio_image" || kind === "workflow_image" || kind === "avatar") {
    return "/api/studio/generations/start";
  }
  if (kind === "studio_upscale") return "/api/kie/upscale";
  return "-";
}

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(10, Number(url.searchParams.get("per_page")) || 50));
  const kind = url.searchParams.get("kind") || null;
  const status = url.searchParams.get("status") || null;
  const userId = url.searchParams.get("user_id") || null;
  const search = url.searchParams.get("q")?.trim() || null;
  const emailFilter = url.searchParams.get("email")?.trim().toLowerCase() || null;
  const fromDate = url.searchParams.get("from") || null;
  const toDate = url.searchParams.get("to") || null;
  const sort = url.searchParams.get("sort") || "when";
  const order: "asc" | "desc" = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let emailUserIds: string[] | null = null;
  if (emailFilter) {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    emailUserIds = (userList?.users ?? [])
      .filter((u) => (u.email ?? "").toLowerCase().includes(emailFilter))
      .map((u) => u.id);
    if (emailUserIds.length === 0) {
      return NextResponse.json({ rows: [], emailMap: {}, total: 0, page, perPage, userSummary: null });
    }
  }

  const sortColumn = sort === "charged" ? "credits_charged" : sort === "balance" ? "credit_balance_after" : "created_at";

  let query = admin
    .from("studio_generations")
    .select("*", { count: "exact" })
    .order(sortColumn, { ascending: order === "asc" })
    .range(from, to);

  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  if (userId) query = query.eq("user_id", userId);
  if (emailUserIds) query = query.in("user_id", emailUserIds);
  if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00.000Z`);
  if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);
  if (search) query = query.or(`label.ilike.%${search}%,external_task_id.ilike.%${search}%`);

  const { data: rows, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Collect unique user_ids and fetch emails
  const userIds = [...new Set((rows ?? []).map((r: Record<string, unknown>) => r.user_id as string))];
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users?.users) {
      for (const u of users.users) {
        if (userIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? u.id;
        }
      }
    }
  }

  let userSummary: null | {
    user_id: string;
    email: string;
    plan_id: string | null;
    current_balance_display: number;
    spent_this_month_display: number;
    ready: number;
    failed: number;
    processing: number;
  } = null;

  if (emailUserIds && emailUserIds.length === 1) {
    const uid = emailUserIds[0]!;
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const { getUserCreditBalance } = await import("@/lib/creditGrants");
    const { ledgerTicksToDisplayCredits } = await import("@/lib/creditLedgerTicks");

    const [userInfo, planRow, balanceRes, monthRows, statusRows] = await Promise.all([
      admin.auth.admin.getUserById(uid),
      admin.from("user_subscriptions").select("plan_id").eq("user_id", uid).maybeSingle(),
      getUserCreditBalance(admin, uid),
      admin.from("studio_generations").select("credits_charged").eq("user_id", uid).gte("created_at", startOfMonth.toISOString()),
      admin.from("studio_generations").select("status").eq("user_id", uid),
    ]);

    const monthData = (monthRows.data ?? []) as Array<{ credits_charged: number }>;
    const statusData = (statusRows.data ?? []) as Array<{ status: string }>;
    const spentThisMonthTicks = monthData.reduce<number>((s, r) => s + (r.credits_charged ?? 0), 0);

    userSummary = {
      user_id: uid,
      email: userInfo.data?.user?.email ?? uid,
      plan_id: (planRow.data as { plan_id?: string } | null)?.plan_id ?? null,
      current_balance_display: balanceRes.balance,
      spent_this_month_display: ledgerTicksToDisplayCredits(spentThisMonthTicks),
      ready: statusData.filter((r) => r.status === "ready").length,
      failed: statusData.filter((r) => r.status === "failed").length,
      processing: statusData.filter((r) => r.status === "processing").length,
    };
  }

  return NextResponse.json({
    rows: (rows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      app_endpoint: deriveAppEndpoint(r),
    })),
    emailMap,
    total: count ?? 0,
    page,
    perPage,
    userSummary,
  });
}
