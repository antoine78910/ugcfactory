export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { addPackCredits, getUserCreditBalance } from "@/lib/creditGrants";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";
import { insertComplimentaryPlan } from "@/lib/complimentarySubscription";
import { isSubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { serverLog } from "@/lib/serverLog";

/**
 * Subscription plan → monthly credit allowance. Kept in sync with the Stripe
 * webhook (`SUBSCRIPTION_CREDITS`) and `pricing.ts::SUBSCRIPTIONS`.
 */
const SUBSCRIPTION_CREDITS: Record<string, number> = {
  starter: 240,
  growth: 600,
  pro: 1400,
  scale: 3200,
};

type TokenRow = {
  id: string;
  amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  grant_type: "credits" | "plan";
  plan_id: string | null;
  plan_billing: string | null;
  plan_duration_days: number | null;
};

/**
 * POST /api/credits/redeem
 * Authenticated user redeems a token secret.
 * Body: { token: string }
 *
 * Two grant types are supported:
 *   • credits, adds pack credits (3-month expiry) to the ledger.
 *   • plan,    grants complimentary access to a subscription tier for
 *              `plan_duration_days`, plus one month of that tier's credits.
 *
 * Security:
 *  - User must be authenticated (Supabase session).
 *  - Token must exist, not be expired, not exceed max_uses.
 *  - Same user cannot redeem the same token twice (DB unique constraint on
 *    credit_redeem_logs).
 *  - used_count is bumped atomically with a conditional UPDATE (race-safe).
 *  - Plan grants are written to `complimentary_subscriptions`, not
 *    `user_subscriptions`, so the live-Stripe sync cannot overwrite them.
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const secret = typeof body.token === "string" ? body.token.trim() : "";
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const markRedeemAccessGranted = async () => {
    try {
      const { data } = await admin.auth.admin.getUserById(auth.user.id);
      const currentMeta = (data?.user?.app_metadata ?? {}) as Record<string, unknown>;
      await admin.auth.admin.updateUserById(auth.user.id, {
        app_metadata: {
          ...currentMeta,
          redeem_access_granted: true,
          redeem_access_granted_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[redeem] could not update app_metadata redeem_access_granted:", err);
      // Non-blocking on purpose: redeem should not fail if metadata update fails.
    }
  };

  const { data: tokenRaw, error: fetchErr } = await admin
    .from("credit_redeem_tokens")
    .select(
      "id, amount, max_uses, used_count, expires_at, grant_type, plan_id, plan_billing, plan_duration_days",
    )
    .eq("secret", secret)
    .single();

  if (fetchErr || !tokenRaw) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const token = tokenRaw as TokenRow;

  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 410 });
  }

  if (token.max_uses != null && token.used_count >= token.max_uses) {
    return NextResponse.json({ error: "Token has been fully redeemed" }, { status: 410 });
  }

  const { data: existing } = await admin
    .from("credit_redeem_logs")
    .select("id")
    .eq("token_id", token.id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You have already redeemed this token" }, { status: 409 });
  }

  // Validate plan shape BEFORE incrementing anything so we never "spend" a use
  // on an invalid row (should be impossible with the DB check constraint, but
  // defensive).
  if (token.grant_type === "plan") {
    if (
      !token.plan_id ||
      !isSubscriptionPlanId(token.plan_id) ||
      (token.plan_billing !== "monthly" && token.plan_billing !== "yearly") ||
      !token.plan_duration_days ||
      token.plan_duration_days < 1
    ) {
      console.error("[redeem] malformed plan token", { tokenId: token.id });
      return NextResponse.json({ error: "Invalid plan token" }, { status: 500 });
    }
  }

  // Atomic bump: only succeeds if used_count hasn't raced past max_uses.
  let bumpQuery = admin
    .from("credit_redeem_tokens")
    .update({ used_count: token.used_count + 1 }, { count: "exact" })
    .eq("id", token.id)
    .eq("used_count", token.used_count);

  if (token.max_uses != null) {
    bumpQuery = bumpQuery.lt("used_count", token.max_uses);
  }

  const { error: bumpErr, count } = await bumpQuery;
  if (bumpErr) {
    console.error("[redeem] bump used_count error:", bumpErr);
    return NextResponse.json({ error: "Could not redeem token" }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json({ error: "Token has been fully redeemed" }, { status: 410 });
  }

  // --- Credits grant ---------------------------------------------------------
  if (token.grant_type === "credits") {
    const { error: logErr } = await admin.from("credit_redeem_logs").insert({
      token_id: token.id,
      user_id: auth.user.id,
      amount: displayCreditsToLedgerTicks(token.amount),
      grant_type: "credits",
    });
    if (logErr) {
      console.error("[redeem] log insert error:", logErr);
      // Non-fatal: credits still granted below.
    }

    await addPackCredits(admin, auth.user.id, token.amount);
    await markRedeemAccessGranted();

    const { balance } = await getUserCreditBalance(admin, auth.user.id);

    return NextResponse.json({
      success: true,
      grantType: "credits",
      credited: token.amount,
      balance,
    });
  }

  // --- Plan grant ------------------------------------------------------------
  // We re-validated the plan-token shape above, so these casts are safe.
  const planIdRaw = token.plan_id as string;
  if (!isSubscriptionPlanId(planIdRaw)) {
    return NextResponse.json({ error: "Invalid plan token" }, { status: 500 });
  }
  const planId = planIdRaw;
  const billing = token.plan_billing as "monthly" | "yearly";
  const durationDays = token.plan_duration_days as number;
  const monthlyCredits = SUBSCRIPTION_CREDITS[planId] ?? 0;

  let compId: string | null = null;
  let expiresAt: string | null = null;
  try {
    const row = await insertComplimentaryPlan(admin, {
      userId: auth.user.id,
      planId,
      billing,
      durationDays,
      tokenId: token.id,
      source: "partner_link",
    });
    compId = row.id;
    expiresAt = row.expiresAt;
  } catch (err) {
    console.error("[redeem] complimentary insert error:", err);
    // Best-effort rollback of the used_count bump.
    await admin
      .from("credit_redeem_tokens")
      .update({ used_count: token.used_count })
      .eq("id", token.id)
      .eq("used_count", token.used_count + 1);
    return NextResponse.json({ error: "Could not grant plan" }, { status: 500 });
  }

  const { error: logErr } = await admin.from("credit_redeem_logs").insert({
    token_id: token.id,
    user_id: auth.user.id,
    amount: displayCreditsToLedgerTicks(monthlyCredits),
    grant_type: "plan",
    plan_id: planId,
    plan_billing: billing,
    plan_expires_at: expiresAt,
  });
  if (logErr) {
    console.error("[redeem] plan log insert error:", logErr);
  }

  // Hand out a month of credits immediately. Further monthly top-ups are
  // intentionally not automatic for comp plans — partners can be renewed by
  // generating a fresh link if needed.
  if (monthlyCredits > 0) {
    await addPackCredits(admin, auth.user.id, monthlyCredits);
  }
  await markRedeemAccessGranted();

  serverLog("redeem_plan_granted", {
    userId: auth.user.id,
    planId,
    billing,
    durationDays,
    tokenId: token.id,
  });

  const { balance } = await getUserCreditBalance(admin, auth.user.id);

  return NextResponse.json({
    success: true,
    grantType: "plan",
    planId,
    planBilling: billing,
    planExpiresAt: expiresAt,
    credited: monthlyCredits,
    balance,
    complimentarySubscriptionId: compId,
  });
}
