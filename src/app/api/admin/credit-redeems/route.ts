export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { ledgerTicksToDisplayCredits } from "@/lib/creditLedgerTicks";

type TokenRow = {
  id: string;
  secret: string;
  label: string | null;
  amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_at: string;
  grant_type: "credits" | "plan" | null;
  plan_id: string | null;
  plan_billing: string | null;
  plan_duration_days: number | null;
  bundle_plan_id: string | null;
  bundle_plan_billing: string | null;
  bundle_plan_duration_days: number | null;
};

type TokenEmbed = {
  label: string | null;
  secret: string;
  amount: number;
  grant_type: string | null;
  plan_id: string | null;
  plan_billing: string | null;
};

type LogRow = {
  id: string;
  user_id: string;
  amount: number;
  redeemed_at: string;
  token_id: string;
  grant_type: string | null;
  plan_id: string | null;
  plan_billing: string | null;
  plan_expires_at: string | null;
  credit_redeem_tokens: TokenEmbed | TokenEmbed[] | null;
};

type ActiveCompPlanRow = {
  id: string;
  user_id: string;
  plan_id: string;
  billing: "monthly" | "yearly";
  source: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  token_id: string | null;
};

function embedToken(embed: LogRow["credit_redeem_tokens"]): TokenEmbed | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function isTokenActive(t: TokenRow, now: Date): boolean {
  if (t.expires_at && new Date(t.expires_at) < now) return false;
  if (t.max_uses != null && t.used_count >= t.max_uses) return false;
  return true;
}

/**
 * GET /api/admin/credit-redeems
 * Primary admin only, lists redeem tokens and paginated redemption audit log.
 */
export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const logPage = Math.max(1, Number(url.searchParams.get("log_page")) || 1);
  const logPerPage = Math.min(100, Math.max(10, Number(url.searchParams.get("log_per_page")) || 50));

  const { data: tokensRaw, error: tokErr } = await admin
    .from("credit_redeem_tokens")
    .select(
      "id, secret, label, amount, max_uses, used_count, expires_at, created_at, grant_type, plan_id, plan_billing, plan_duration_days, bundle_plan_id, bundle_plan_billing, bundle_plan_duration_days",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (tokErr) {
    console.error("[admin/credit-redeems] tokens:", tokErr);
    return NextResponse.json(
      { error: tokErr.message, tokens: [], logs: [], activePlans: [], stats: null },
      { status: 500 },
    );
  }

  const tokens = (tokensRaw ?? []) as TokenRow[];
  const now = new Date();

  const logFrom = (logPage - 1) * logPerPage;
  const logTo = logFrom + logPerPage - 1;

  const { data: logsRaw, error: logErr, count: logTotal } = await admin
    .from("credit_redeem_logs")
    .select(
      `
      id,
      user_id,
      amount,
      redeemed_at,
      token_id,
      grant_type,
      plan_id,
      plan_billing,
      plan_expires_at,
      credit_redeem_tokens ( label, secret, amount, grant_type, plan_id, plan_billing )
    `,
      { count: "exact" },
    )
    .order("redeemed_at", { ascending: false })
    .range(logFrom, logTo);

  if (logErr) {
    console.error("[admin/credit-redeems] logs:", logErr);
    return NextResponse.json(
      { error: logErr.message, tokens, logs: [], activePlans: [], stats: null, logTotal: 0 },
      { status: 500 },
    );
  }

  const logs = (logsRaw ?? []) as LogRow[];
  const { data: activePlansRaw, error: activePlanErr } = await admin
    .from("complimentary_subscriptions")
    .select("id, user_id, plan_id, billing, source, granted_at, expires_at, revoked_at, token_id")
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("granted_at", { ascending: false })
    .limit(300);

  if (activePlanErr) {
    console.error("[admin/credit-redeems] active plans:", activePlanErr);
    return NextResponse.json(
      { error: activePlanErr.message, tokens, logs: [], activePlans: [], stats: null, logTotal: 0 },
      { status: 500 },
    );
  }

  const activePlans = (activePlansRaw ?? []) as ActiveCompPlanRow[];
  const userIds = [
    ...new Set([...logs.map((l) => l.user_id), ...activePlans.map((p) => p.user_id)]),
  ];
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

  let creditsOnLogPage = 0;
  for (const l of logs) {
    creditsOnLogPage += ledgerTicksToDisplayCredits(l.amount);
  }

  const { count: redemptionCount } = await admin
    .from("credit_redeem_logs")
    .select("id", { count: "exact", head: true });

  /** Only credit-grant tokens contribute to the "credits issued" tally. */
  const creditsIssuedViaLinks = tokens.reduce((sum, t) => {
    if ((t.grant_type ?? "credits") !== "credits") return sum;
    return sum + t.amount * t.used_count;
  }, 0);

  const { count: plansGrantedCount } = await admin
    .from("complimentary_subscriptions")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString());

  const stats = {
    tokensTotal: tokens.length,
    tokensActive: tokens.filter((t) => isTokenActive(t, now)).length,
    tokensExhausted: tokens.filter((t) => t.max_uses != null && t.used_count >= t.max_uses).length,
    redemptionsTotal: redemptionCount ?? 0,
    creditsIssuedViaLinks: Math.round(creditsIssuedViaLinks * 100) / 100,
    creditsOnLogPage: Math.round(creditsOnLogPage * 100) / 100,
    plansActive: plansGrantedCount ?? 0,
  };

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      ...t,
      grant_type: t.grant_type ?? "credits",
      active: isTokenActive(t, now),
    })),
    logs: logs.map((l) => {
      const t = embedToken(l.credit_redeem_tokens);
      const grantType = (l.grant_type ?? t?.grant_type ?? "credits") as "credits" | "plan";
      return {
        id: l.id,
        user_id: l.user_id,
        email: emailMap[l.user_id] ?? l.user_id,
        credits: ledgerTicksToDisplayCredits(l.amount),
        redeemed_at: l.redeemed_at,
        token_id: l.token_id,
        token_label: t?.label ?? null,
        token_secret_prefix: t?.secret ? `${t.secret.slice(0, 8)}…` : null,
        token_offer_amount: t?.amount ?? null,
        grant_type: grantType,
        plan_id: l.plan_id ?? t?.plan_id ?? null,
        plan_billing: l.plan_billing ?? t?.plan_billing ?? null,
        plan_expires_at: l.plan_expires_at ?? null,
      };
    }),
    activePlans: activePlans.map((p) => {
      const token = p.token_id ? tokens.find((t) => t.id === p.token_id) : null;
      return {
        id: p.id,
        user_id: p.user_id,
        email: emailMap[p.user_id] ?? p.user_id,
        plan_id: p.plan_id,
        billing: p.billing,
        source: p.source,
        granted_at: p.granted_at,
        expires_at: p.expires_at,
        token_id: p.token_id,
        token_label: token?.label ?? null,
      };
    }),
    logTotal: logTotal ?? 0,
    logPage,
    logPerPage,
    stats,
  });
}

/**
 * PATCH /api/admin/credit-redeems
 * Primary admin only, revoke an active complimentary plan immediately.
 * Body: { action: "revoke_plan", planId: string }
 */
export async function PATCH(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  let body: { action?: string; planId?: string };
  try {
    body = (await req.json()) as { action?: string; planId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "revoke_plan") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const planId = typeof body.planId === "string" ? body.planId.trim() : "";
  if (!planId) {
    return NextResponse.json({ error: "Missing planId" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("complimentary_subscriptions")
    .update({ revoked_at: nowIso })
    .eq("id", planId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/credit-redeems] revoke plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Plan not found or already revoked" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, planId, revokedAt: nowIso });
}
