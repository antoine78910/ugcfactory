export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isSubscriptionUnlimitedEmail } from "@/lib/allowedUsers";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { isPrimaryAdminEmail } from "@/lib/adminEmails";
import {
  isSubscriptionPlanId,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";

type GrantType = "credits" | "plan";

/**
 * POST /api/credits/redeem-tokens
 * Admin-only: create a new redeem token.
 *
 * Body (credits grant):
 *   { grantType?: "credits", amount: number, label?: string, maxUses?: number, expiresInDays?: number }
 *
 * Body (plan grant — partner giveaway):
 *   { grantType: "plan", planId: "starter"|"growth"|"pro"|"scale",
 *     planBilling: "monthly"|"yearly", planDurationDays: number,
 *     label?: string, maxUses?: number, expiresInDays?: number }
 *
 * Returns: { token: { secret, amount, maxUses, expiresAt, url, grantType, planId?, planBilling?, planDurationDays? } }
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  // Any allowlisted or primary-admin email may create tokens, but plan grants
  // are restricted to the primary admin account since they carry a financial
  // impact (they unlock paid-tier access without a Stripe charge).
  if (!isSubscriptionUnlimitedEmail(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    amount?: number;
    label?: string;
    maxUses?: number;
    expiresInDays?: number;
    grantType?: string;
    planId?: string;
    planBilling?: string;
    planDurationDays?: number;
    /** Optional partner-bundle: also grants comp plan on a credits token. */
    bundlePlanId?: string;
    bundlePlanBilling?: string;
    bundlePlanDurationDays?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const grantTypeRaw = (body.grantType ?? "credits").toString().trim();
  const grantType: GrantType = grantTypeRaw === "plan" ? "plan" : "credits";

  // A bundle attaches comp plan access to a credits token. Treat it with the
  // same financial-impact restriction as a pure plan grant.
  const bundleRequested =
    grantType === "credits" &&
    (body.bundlePlanId != null ||
      body.bundlePlanBilling != null ||
      body.bundlePlanDurationDays != null);

  if ((grantType === "plan" || bundleRequested) && !isPrimaryAdminEmail(email)) {
    return NextResponse.json(
      { error: "Only the primary admin can create plan-grant links." },
      { status: 403 },
    );
  }

  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : null;
  const maxUses =
    body.maxUses != null ? Math.max(1, Math.round(Number(body.maxUses) || 1)) : null;

  let expiresAt: string | null = null;
  if (body.expiresInDays != null) {
    const days = Math.max(1, Math.round(Number(body.expiresInDays) || 30));
    expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  let insertPayload: Record<string, unknown> = {
    label,
    max_uses: maxUses,
    expires_at: expiresAt,
    grant_type: grantType,
  };

  if (grantType === "credits") {
    const amount = Math.round(Number(body.amount) || 0);
    if (amount <= 0 || amount > 10_000) {
      return NextResponse.json({ error: "amount must be 1–10 000" }, { status: 400 });
    }
    insertPayload = { ...insertPayload, amount };

    // Optional partner-bundle: validate all three fields together.
    if (bundleRequested) {
      const bundlePlanRaw = String(body.bundlePlanId ?? "").trim();
      if (!isSubscriptionPlanId(bundlePlanRaw)) {
        return NextResponse.json(
          { error: "bundlePlanId must be one of starter|growth|pro|scale" },
          { status: 400 },
        );
      }
      const bundleBillingRaw = String(body.bundlePlanBilling ?? "").trim();
      if (bundleBillingRaw !== "monthly" && bundleBillingRaw !== "yearly") {
        return NextResponse.json(
          { error: "bundlePlanBilling must be 'monthly' or 'yearly'" },
          { status: 400 },
        );
      }
      const bundleDuration = Math.round(Number(body.bundlePlanDurationDays) || 0);
      if (!Number.isFinite(bundleDuration) || bundleDuration < 1 || bundleDuration > 3650) {
        return NextResponse.json(
          { error: "bundlePlanDurationDays must be 1–3650" },
          { status: 400 },
        );
      }
      insertPayload = {
        ...insertPayload,
        bundle_plan_id: bundlePlanRaw as SubscriptionPlanId,
        bundle_plan_billing: bundleBillingRaw,
        bundle_plan_duration_days: bundleDuration,
      };
    }
  } else {
    const planIdRaw = String(body.planId ?? "").trim();
    if (!isSubscriptionPlanId(planIdRaw)) {
      return NextResponse.json(
        { error: "planId must be one of starter|growth|pro|scale" },
        { status: 400 },
      );
    }
    const planId: SubscriptionPlanId = planIdRaw;
    const planBillingRaw = String(body.planBilling ?? "").trim();
    if (planBillingRaw !== "monthly" && planBillingRaw !== "yearly") {
      return NextResponse.json(
        { error: "planBilling must be 'monthly' or 'yearly'" },
        { status: 400 },
      );
    }
    const duration = Math.round(Number(body.planDurationDays) || 0);
    if (!Number.isFinite(duration) || duration < 1 || duration > 3650) {
      return NextResponse.json(
        { error: "planDurationDays must be 1–3650" },
        { status: 400 },
      );
    }

    // `amount` column is NOT NULL CHECK (> 0). We store the plan's monthly
    // credit allowance there as informational metadata (redeem route issues
    // the actual credits). Set a safe positive sentinel value (1) so the check
    // passes — the redeem route ignores this field for plan grants.
    insertPayload = {
      ...insertPayload,
      amount: 1,
      plan_id: planId,
      plan_billing: planBillingRaw,
      plan_duration_days: duration,
    };
  }

  const { data, error } = await admin
    .from("credit_redeem_tokens")
    .insert(insertPayload)
    .select(
      "secret, amount, max_uses, expires_at, grant_type, plan_id, plan_billing, plan_duration_days, bundle_plan_id, bundle_plan_billing, bundle_plan_duration_days",
    )
    .single();

  if (error || !data) {
    console.error("[redeem-tokens] insert error:", error);
    return NextResponse.json({ error: "Could not create token" }, { status: 500 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "https://app.youry.io";

  return NextResponse.json({
    token: {
      secret: data.secret,
      amount: data.amount,
      maxUses: data.max_uses,
      expiresAt: data.expires_at,
      grantType: data.grant_type,
      planId: data.plan_id,
      planBilling: data.plan_billing,
      planDurationDays: data.plan_duration_days,
      bundlePlanId: data.bundle_plan_id,
      bundlePlanBilling: data.bundle_plan_billing,
      bundlePlanDurationDays: data.bundle_plan_duration_days,
      url: `${origin}/redeem?token=${data.secret}`,
    },
  });
}

/**
 * GET /api/credits/redeem-tokens
 * Admin-only: list all tokens with usage stats.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  if (!isSubscriptionUnlimitedEmail(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("credit_redeem_tokens")
    .select(
      "id, secret, label, amount, max_uses, used_count, expires_at, created_at, grant_type, plan_id, plan_billing, plan_duration_days, bundle_plan_id, bundle_plan_billing, bundle_plan_duration_days",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[redeem-tokens] list error:", error);
    return NextResponse.json({ error: "Could not list tokens" }, { status: 500 });
  }

  return NextResponse.json({ tokens: data });
}
