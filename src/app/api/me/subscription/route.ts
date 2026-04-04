export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";
import {
  getPlanFromPriceId,
  isSubscriptionPlanId,
  subscriptionPlanSortIndex,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import { isAllowedUser } from "@/lib/allowedUsers";
import { getUserCreditBalance, resetSubscriptionCredits } from "@/lib/creditGrants";

/** Monthly credits for a paid tier (aligned with Stripe webhook). */
function subscriptionCreditsForPlan(planId: SubscriptionPlanId): number {
  const i = subscriptionPlanSortIndex(planId);
  return i >= 0 ? SUBSCRIPTIONS[i].credits_per_month : 0;
}

/**
 * If the user has a paid plan but zero active subscription credits in the
 * ledger, create the monthly grant. This covers webhook failures, Stripe
 * timing issues, and Date-parse crashes.
 *
 * Only runs once per period: if there is ANY non-expired subscription grant
 * with remaining > 0 we assume the user already has (or spent) their credits.
 * If all subscription grants have remaining = 0, the user legitimately spent
 * everything — we do NOT re-grant.
 *
 * To distinguish "never granted" from "fully spent" we check if there are
 * ANY subscription grants at all (even with remaining=0) created in the last
 * 35 days. If there are, skip. If there are none → webhook never fired.
 */
async function healMissingSubscriptionCredits(
  admin: SupabaseClient,
  userId: string,
  planId: SubscriptionPlanId,
  periodEndHint?: Date | null,
): Promise<void> {
  const amount = subscriptionCreditsForPlan(planId);
  if (amount <= 0) return;

  const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentGrants } = await admin
    .from("user_credit_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "subscription")
    .gte("created_at", thirtyFiveDaysAgo)
    .limit(1)
    .maybeSingle();

  if (recentGrants) return;

  const expiresAt =
    periodEndHint && Number.isFinite(periodEndHint.getTime())
      ? periodEndHint
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  console.log("[me/subscription] healing missing credits", { userId, planId, amount, expiresAt: expiresAt.toISOString() });
  await resetSubscriptionCredits(admin, userId, amount, expiresAt);
}

export type MeSubscriptionResponse = {
  planId: AccountPlanId;
  billing: "monthly" | "yearly" | null;
  userId: string;
  /** When true the client must not deduct or check credits — account has unlimited access. */
  unlimited?: boolean;
  /**
   * When true the client should auto-activate stored personal API keys
   * so that generations use the founder's own provider accounts.
   * Only set for emails in the server-side allowlist — never exposed for other users.
   */
  autoEnablePersonalApi?: boolean;
  /** Server-authoritative credit balance from the ledger (sum of non-expired grants). */
  creditBalance?: number;
};

/**
 * Returns the user's active plan.
 * Source of truth: Stripe (queried live by customer email).
 * When Stripe confirms an active subscription, the DB row is synced automatically.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  // Allowlisted accounts get unlimited access — skip Stripe entirely.
  if (isAllowedUser(auth.user.email)) {
    return NextResponse.json({
      planId: "scale" as AccountPlanId,
      billing: null,
      userId: auth.user.id,
      unlimited: true,
      autoEnablePersonalApi: true,
      creditBalance: 999_999,
    } satisfies MeSubscriptionResponse);
  }

  const userId = auth.user.id;

  // Helper: attach credit balance to any response
  async function withCreditBalance(base: MeSubscriptionResponse): Promise<MeSubscriptionResponse> {
    try {
      const a = createSupabaseServiceClient();
      if (a) {
        const bal = await getUserCreditBalance(a, userId);
        return { ...base, creditBalance: bal.balance };
      }
    } catch { /* non-critical */ }
    return { ...base, creditBalance: 0 };
  }

  const free: MeSubscriptionResponse = { planId: "free", billing: null, userId };

  const secret = process.env.STRIPE_SECRET_KEY?.trim();

  // ── 1. Query Stripe directly ──────────────────────────────────────────────
  if (secret && auth.user.email) {
    try {
      const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

      // Find customers matching this email in Stripe
      const customers = await stripe.customers.list({
        email: auth.user.email,
        limit: 10,
      });

      for (const customer of customers.data) {
        // Check active and trialing subscriptions
        const subs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "active",
          limit: 5,
        });
        const trialingSubs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "trialing",
          limit: 5,
        });

        const allSubs = [...subs.data, ...trialingSubs.data];

        for (const sub of allSubs) {
          for (const item of sub.items.data) {
            const match = getPlanFromPriceId(item.price.id);
            if (!match) continue;

            const { planId, billing } = match;

            // Sync DB with the live Stripe data
            try {
              const admin = createSupabaseServiceClient();
              if (admin) {
                const rawEnd = (sub as any).current_period_end;
                const endMs = typeof rawEnd === "number" && rawEnd > 0 ? rawEnd * 1000 : NaN;
                const periodEndIso = Number.isFinite(endMs)
                  ? new Date(endMs).toISOString()
                  : null;

                await admin.from("user_subscriptions").upsert(
                  {
                    user_id: auth.user.id,
                    stripe_subscription_id: sub.id,
                    stripe_customer_id: String(sub.customer),
                    plan_id: planId,
                    billing,
                    status: sub.status,
                    ...(periodEndIso ? { current_period_end: periodEndIso } : {}),
                  },
                  { onConflict: "user_id" },
                );

                if (isSubscriptionPlanId(planId)) {
                  const periodEndHint = Number.isFinite(endMs) ? new Date(endMs) : null;
                  await healMissingSubscriptionCredits(admin, userId, planId, periodEndHint);
                }
              }
            } catch (dbErr) {
              console.error("[me/subscription] DB sync error:", dbErr);
            }

            // Fetch authoritative credit balance from the ledger
            let creditBalance = 0;
            try {
              const adminForBalance = createSupabaseServiceClient();
              if (adminForBalance) {
                const bal = await getUserCreditBalance(adminForBalance, userId);
                creditBalance = bal.balance;
              }
            } catch { /* non-critical */ }

            return NextResponse.json({
              planId,
              billing,
              userId: auth.user.id,
              creditBalance,
            } satisfies MeSubscriptionResponse);
          }
        }
      }

      // No active subscription found in Stripe → ensure DB is set to canceled
      try {
        const admin = createSupabaseServiceClient();
        if (admin) {
          await admin
            .from("user_subscriptions")
            .update({ status: "canceled" })
            .eq("user_id", auth.user.id)
            .neq("status", "canceled");
        }
      } catch {
        // non-critical
      }

      return NextResponse.json(await withCreditBalance(free));
    } catch (err) {
      console.error("[me/subscription] Stripe error:", err);
      // Fall through to DB fallback below
    }
  }

  // ── 2. Fallback: read from DB (when Stripe key is missing or Stripe failed) ─
  try {
    const admin = createSupabaseServiceClient();
    if (!admin) return NextResponse.json(await withCreditBalance(free));

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, billing, status, current_period_end")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !data) return NextResponse.json(await withCreditBalance(free));
    if (data.status !== "active" && data.status !== "trialing") {
      return NextResponse.json(await withCreditBalance(free));
    }

    const planId = parseAccountPlan(data.plan_id);
    const raw = data.billing;
    const billing = raw === "yearly" ? "yearly" : raw === "monthly" ? "monthly" : null;

    if (planId !== "free" && isSubscriptionPlanId(planId)) {
      try {
        let pe: Date | null = null;
        if (data.current_period_end) {
          const d = new Date(String(data.current_period_end));
          if (Number.isFinite(d.getTime())) pe = d;
        }
        await healMissingSubscriptionCredits(admin, auth.user.id, planId, pe);
      } catch {
        /* non-critical */
      }
    }

    return NextResponse.json(await withCreditBalance({
      planId,
      billing: planId === "free" ? null : billing,
      userId: auth.user.id,
    }));
  } catch (err) {
    console.error("[me/subscription] DB fallback error:", err);
    return NextResponse.json(await withCreditBalance(free));
  }
}
