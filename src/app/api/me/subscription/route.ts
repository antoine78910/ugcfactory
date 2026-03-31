export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";
import { getPlanFromPriceId } from "@/lib/stripe/subscriptionPrices";
import { isAllowedUser } from "@/lib/allowedUsers";

export type MeSubscriptionResponse = {
  planId: AccountPlanId;
  billing: "monthly" | "yearly" | null;
  userId: string;
  /** When true the client must not deduct or check credits — account has unlimited access. */
  unlimited?: boolean;
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
    } satisfies MeSubscriptionResponse);
  }

  const free: MeSubscriptionResponse = { planId: "free", billing: null, userId: auth.user.id };

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
                await admin.from("user_subscriptions").upsert(
                  {
                    user_id: auth.user.id,
                    stripe_subscription_id: sub.id,
                    stripe_customer_id: String(sub.customer),
                    plan_id: planId,
                    billing,
                    status: sub.status,
                    current_period_end: new Date(
                      (sub as any).current_period_end * 1000,
                    ).toISOString(),
                  },
                  { onConflict: "user_id" },
                );
              }
            } catch (dbErr) {
              console.error("[me/subscription] DB sync error:", dbErr);
            }

            return NextResponse.json({
              planId,
              billing,
              userId: auth.user.id,
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

      return NextResponse.json(free satisfies MeSubscriptionResponse);
    } catch (err) {
      console.error("[me/subscription] Stripe error:", err);
      // Fall through to DB fallback below
    }
  }

  // ── 2. Fallback: read from DB (when Stripe key is missing or Stripe failed) ─
  try {
    const admin = createSupabaseServiceClient();
    if (!admin) return NextResponse.json(free satisfies MeSubscriptionResponse);

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, billing, status")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !data) return NextResponse.json(free satisfies MeSubscriptionResponse);
    if (data.status !== "active" && data.status !== "trialing") {
      return NextResponse.json(free satisfies MeSubscriptionResponse);
    }

    const planId = parseAccountPlan(data.plan_id);
    const raw = data.billing;
    const billing = raw === "yearly" ? "yearly" : raw === "monthly" ? "monthly" : null;

    return NextResponse.json({
      planId,
      billing: planId === "free" ? null : billing,
      userId: auth.user.id,
    } satisfies MeSubscriptionResponse);
  } catch (err) {
    console.error("[me/subscription] DB fallback error:", err);
    return NextResponse.json(free satisfies MeSubscriptionResponse);
  }
}
