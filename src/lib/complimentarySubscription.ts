/**
 * Complimentary subscription (admin-granted plan access, no Stripe customer).
 *
 * Used by partner gift links that grant a plan tier for a fixed duration.
 * Stored in `public.complimentary_subscriptions` (separate from
 * `user_subscriptions` which is kept in lock-step with Stripe).
 *
 * All helpers are server-only and assume a service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSubscriptionPlanId,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import {
  planRank,
  parseAccountPlan,
  type AccountPlanId,
} from "@/lib/subscriptionModelAccess";

export type ComplimentaryBilling = "monthly" | "yearly";

export type ActiveComplimentaryPlan = {
  id: string;
  planId: SubscriptionPlanId;
  billing: ComplimentaryBilling;
  grantedAt: string;
  expiresAt: string;
  tokenId: string | null;
};

/**
 * Fetch the currently active complimentary plan for a user, if any.
 * Picks the highest-tier non-expired row (ties broken by farthest expiry).
 */
export async function getActiveComplimentaryPlan(
  admin: SupabaseClient,
  userId: string,
): Promise<ActiveComplimentaryPlan | null> {
  const { data, error } = await admin
    .from("complimentary_subscriptions")
    .select("id, plan_id, billing, granted_at, expires_at, token_id, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("[complimentarySubscription] fetch error:", error.message);
    return null;
  }

  const rows = data ?? [];
  if (rows.length === 0) return null;

  let best: ActiveComplimentaryPlan | null = null;
  let bestRank = -1;
  let bestExpiry = 0;

  for (const raw of rows) {
    const planIdRaw = String(raw.plan_id ?? "");
    if (!isSubscriptionPlanId(planIdRaw)) continue;
    const billingRaw = String(raw.billing ?? "");
    const billing: ComplimentaryBilling =
      billingRaw === "yearly" ? "yearly" : "monthly";

    const rank = planRank(planIdRaw);
    const expiry = Date.parse(raw.expires_at as string) || 0;
    const better =
      rank > bestRank || (rank === bestRank && expiry > bestExpiry);
    if (!better) continue;

    best = {
      id: String(raw.id),
      planId: planIdRaw,
      billing,
      grantedAt: String(raw.granted_at),
      expiresAt: String(raw.expires_at),
      tokenId: raw.token_id ? String(raw.token_id) : null,
    };
    bestRank = rank;
    bestExpiry = expiry;
  }

  return best;
}

/**
 * Merge a complimentary plan with a Stripe-derived plan.
 * Returns the effective `AccountPlanId` (highest tier) and whether the comp
 * plan was used.
 */
export function pickHigherPlan(
  stripePlan: AccountPlanId,
  comp: ActiveComplimentaryPlan | null,
): { planId: AccountPlanId; fromComplimentary: boolean } {
  if (!comp) return { planId: stripePlan, fromComplimentary: false };
  const stripeRank = planRank(stripePlan);
  const compRank = planRank(comp.planId);
  if (compRank > stripeRank) {
    return { planId: comp.planId, fromComplimentary: true };
  }
  return { planId: stripePlan, fromComplimentary: false };
}

/**
 * Insert a complimentary subscription row. No side effects (credits / metadata
 * are handled by the caller).
 */
export async function insertComplimentaryPlan(
  admin: SupabaseClient,
  opts: {
    userId: string;
    planId: SubscriptionPlanId;
    billing: ComplimentaryBilling;
    durationDays: number;
    tokenId: string | null;
    source?: "partner_link" | "admin_manual";
  },
): Promise<ActiveComplimentaryPlan> {
  const duration = Math.max(1, Math.min(3650, Math.round(opts.durationDays)));
  const expiresAt = new Date(Date.now() + duration * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("complimentary_subscriptions")
    .insert({
      user_id: opts.userId,
      plan_id: opts.planId,
      billing: opts.billing,
      token_id: opts.tokenId,
      source: opts.source ?? "partner_link",
      expires_at: expiresAt,
    })
    .select("id, plan_id, billing, granted_at, expires_at, token_id")
    .single();

  if (error || !data) {
    throw new Error(
      `Could not insert complimentary plan: ${error?.message ?? "unknown error"}`,
    );
  }

  const planIdResolved = parseAccountPlan(data.plan_id);
  if (planIdResolved === "free") {
    throw new Error("Invalid plan_id returned from DB");
  }
  const billingResolved: ComplimentaryBilling =
    data.billing === "yearly" ? "yearly" : "monthly";

  return {
    id: String(data.id),
    planId: planIdResolved,
    billing: billingResolved,
    grantedAt: String(data.granted_at),
    expiresAt: String(data.expires_at),
    tokenId: data.token_id ? String(data.token_id) : null,
  };
}
