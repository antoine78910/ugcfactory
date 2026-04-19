export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";
import { getPlanFromPriceId } from "@/lib/stripe/subscriptionPrices";
import {
  isAllowedUser,
  isPersonalApiUser,
  isSubscriptionUnlimitedEmail,
} from "@/lib/allowedUsers";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { stripeSubscriptionPeriodEndIso } from "@/lib/stripeSubscriptionPeriodEnd";
import {
  computeStudioAccessAllowed,
  isTrialMetadataActive,
  isTrialTimeWindowOpen,
  type TrialAppMetadata,
} from "@/lib/studioAccessPolicy";

export type MeSubscriptionResponse = {
  planId: AccountPlanId;
  billing: "monthly" | "yearly" | null;
  userId: string;
  /** When true the client must not deduct or check credits, account has unlimited access. */
  unlimited?: boolean;
  /**
   * When true the client should auto-activate stored personal API keys (KIE + PiAPI)
   * so that generations use the founder's own provider accounts.
   * Only set for emails in the server-side allowlist, never exposed for other users.
   */
  autoEnablePersonalApi?: boolean;
  /** Server-authoritative credit balance from the ledger (sum of non-expired grants). */
  creditBalance?: number;
  /**
   * True while the $1 trial window is still open (`trial_started_at` + 24h) and `trial_active`.
   * UI: trial-only gating; not set once the window expires.
   */
  isTrial?: boolean;
  /**
   * When false, the client should keep the user off studio routes until they complete
   * the $1 trial (with credits) or buy a subscription (`/onboarding?step=setup`).
   */
  studioAccessAllowed?: boolean;
};

/**
 * Returns the user's active plan.
 * Source of truth: Stripe (queried live by customer email).
 * When Stripe confirms an active subscription, the DB row is synced automatically.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const adminClient = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, adminClient);

  // Allowlisted + primary admin accounts get unlimited access, skip Stripe entirely.
  if (isSubscriptionUnlimitedEmail(email)) {
    return NextResponse.json({
      planId: "growth" as AccountPlanId,
      billing: null,
      userId: auth.user.id,
      unlimited: true,
      /** Founder allowlist only; primary admins get unlimited credits without forcing personal API mode. */
      autoEnablePersonalApi: isAllowedUser(email),
      creditBalance: 999_999,
      studioAccessAllowed: true,
    } satisfies MeSubscriptionResponse);
  }

  const userId = auth.user.id;

  // Personal-API accounts use real DB credits but auto-enable their own provider keys.
  if (isPersonalApiUser(email)) {
    const admin = createSupabaseServiceClient();
    let creditBalance = 0;
    if (admin) {
      try {
        const bal = await getUserCreditBalance(admin, userId);
        creditBalance = bal.balance;
      } catch { /* non-critical */ }
    }
    return NextResponse.json({
      planId: "scale" as AccountPlanId,
      billing: null,
      userId,
      unlimited: true,
      autoEnablePersonalApi: true,
      creditBalance,
      studioAccessAllowed: true,
    } satisfies MeSubscriptionResponse);
  }

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

  async function getTrialAppMetadata(): Promise<TrialAppMetadata> {
    try {
      const a = createSupabaseServiceClient();
      if (!a) return {};
      const { data } = await a.auth.admin.getUserById(userId);
      return (data?.user?.app_metadata as TrialAppMetadata | undefined) ?? {};
    } catch {
      return {};
    }
  }

  async function withFreeTierTrialFlags(
    base: MeSubscriptionResponse,
    trialMeta: TrialAppMetadata,
  ): Promise<MeSubscriptionResponse> {
    const withBal = await withCreditBalance(base);
    const credits = typeof withBal.creditBalance === "number" && Number.isFinite(withBal.creditBalance)
      ? withBal.creditBalance
      : 0;
    const trialUi = isTrialMetadataActive(trialMeta) && isTrialTimeWindowOpen(trialMeta);
    const studioAccessAllowed = computeStudioAccessAllowed({
      planId: withBal.planId,
      trialMeta,
      creditBalance: credits,
    });
    return { ...withBal, isTrial: trialUi, studioAccessAllowed };
  }

  const free: MeSubscriptionResponse = { planId: "free", billing: null, userId };

  const secret = process.env.STRIPE_SECRET_KEY?.trim();

  // ── 1. Query Stripe directly ──────────────────────────────────────────────
  if (secret && email) {
    try {
      const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

      // Find customers matching this email in Stripe
      const customers = await stripe.customers.list({
        email,
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
            const periodEndIso = stripeSubscriptionPeriodEndIso(sub);

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
                    ...(periodEndIso ? { current_period_end: periodEndIso } : {}),
                  },
                  { onConflict: "user_id" },
                );
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
              studioAccessAllowed: true,
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

      const trialMeta = await getTrialAppMetadata();
      return NextResponse.json(await withFreeTierTrialFlags(free, trialMeta));
    } catch (err) {
      console.error("[me/subscription] Stripe error:", err);
      // Fall through to DB fallback below
    }
  }

  // ── 2. Fallback: read from DB (when Stripe key is missing or Stripe failed) ─
  try {
    const admin = createSupabaseServiceClient();
    if (!admin) {
      const trialMeta = await getTrialAppMetadata();
      return NextResponse.json(await withFreeTierTrialFlags(free, trialMeta));
    }

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, billing, status")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !data) {
      const trialMeta = await getTrialAppMetadata();
      return NextResponse.json(await withFreeTierTrialFlags(free, trialMeta));
    }
    if (data.status !== "active" && data.status !== "trialing") {
      const trialMeta = await getTrialAppMetadata();
      return NextResponse.json(await withFreeTierTrialFlags(free, trialMeta));
    }

    const planId = parseAccountPlan(data.plan_id);
    const raw = data.billing;
    const billing = raw === "yearly" ? "yearly" : raw === "monthly" ? "monthly" : null;

    return NextResponse.json(
      await withCreditBalance({
        planId,
        billing: planId === "free" ? null : billing,
        userId: auth.user.id,
        studioAccessAllowed: true,
      }),
    );
  } catch (err) {
    console.error("[me/subscription] DB fallback error:", err);
    const trialMeta = await getTrialAppMetadata();
    return NextResponse.json(await withFreeTierTrialFlags(free, trialMeta));
  }
}
