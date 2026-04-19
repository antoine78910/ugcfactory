import type Stripe from "stripe";
import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  getPlanFromPriceId,
  getSubscriptionStripePriceId,
  isSubscriptionPlanId,
  subscriptionPlanSortIndex,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";

export type UserSubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  plan_id: string;
  billing: string | null;
  status: string | null;
};

export async function loadUserSubscriptionRow(userId: string): Promise<UserSubscriptionRow | null> {
  const admin = createSupabaseServiceClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, plan_id, billing, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.stripe_subscription_id?.trim() || !data.stripe_customer_id?.trim()) {
    return null;
  }
  return data as UserSubscriptionRow;
}

export function parseDbBilling(raw: string | null | undefined): "monthly" | "yearly" | null {
  if (raw === "yearly") return "yearly";
  if (raw === "monthly") return "monthly";
  return null;
}

export function classifySubscriptionChange(args: {
  currentPlanId: SubscriptionPlanId;
  currentBilling: "monthly" | "yearly";
  targetPlanId: SubscriptionPlanId;
  targetBilling: "monthly" | "yearly";
}): "downgrade" | "same" | "ok" {
  const { currentPlanId, currentBilling, targetPlanId, targetBilling } = args;
  if (currentPlanId === targetPlanId && currentBilling === targetBilling) return "same";
  const a = subscriptionPlanSortIndex(currentPlanId);
  const b = subscriptionPlanSortIndex(targetPlanId);
  if (b < a) return "downgrade";
  return "ok";
}

/** Display $/mo, yearly uses same 0.7× rule as subscription page. */
export function subscriptionPriceDisplayUsd(planId: SubscriptionPlanId, billing: "monthly" | "yearly"): number {
  const i = subscriptionPlanSortIndex(planId);
  const m = i >= 0 ? SUBSCRIPTIONS[i].price_usd : 0;
  if (billing === "monthly") return m;
  return m * 0.7;
}

export function subscriptionCreditsPerMonth(planId: SubscriptionPlanId): number {
  const i = subscriptionPlanSortIndex(planId);
  return i >= 0 ? SUBSCRIPTIONS[i].credits_per_month : 0;
}

export function resolveSubscriptionItemForPlan(
  items: Stripe.SubscriptionItem[],
  currentPlanId: SubscriptionPlanId,
  currentBilling: "monthly" | "yearly",
): Stripe.SubscriptionItem | null {
  const currencies: BillingCheckoutCurrency[] = ["usd", "eur"];
  for (const c of currencies) {
    const expected = getSubscriptionStripePriceId(currentPlanId, currentBilling, c);
    if (expected) {
      const byExact = items.find((it) => it.price.id === expected);
      if (byExact) return byExact;
    }
  }
  const byPlan = items.find((it) => getPlanFromPriceId(it.price.id)?.planId === currentPlanId);
  if (byPlan) return byPlan;
  return items[0] ?? null;
}

export {
  getSubscriptionStripePriceId,
  isSubscriptionPlanId,
  type SubscriptionPlanId,
};
