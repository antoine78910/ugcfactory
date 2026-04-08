/**
 * Stripe Price IDs for subscription checkout (monthly).
 * Set in env — see `.env.example`.
 */

import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";

export const SUBSCRIPTION_PLAN_IDS = ["starter", "growth", "pro", "scale"] as const;
export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLAN_IDS)[number];

export function isSubscriptionPlanId(id: string): id is SubscriptionPlanId {
  return (SUBSCRIPTION_PLAN_IDS as readonly string[]).includes(id);
}

/** 0 = starter … 3 = scale. Returns -1 if unknown. */
export function subscriptionPlanSortIndex(planId: SubscriptionPlanId): number {
  return SUBSCRIPTION_PLAN_IDS.indexOf(planId);
}

/** Monthly recurring prices (Stripe Dashboard). */
export function getMonthlySubscriptionPriceId(
  planId: SubscriptionPlanId,
  currency: BillingCheckoutCurrency = "usd",
): string | null {
  const mapUsd: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER,
    growth: process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH,
    pro: process.env.STRIPE_PRICE_SUBSCRIPTION_PRO,
    scale: process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE,
  };
  const mapEur: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER,
    growth: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH,
    pro: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_PRO,
    scale: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE,
  };
  const map = currency === "eur" ? mapEur : mapUsd;
  const v = map[planId]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

/** Yearly prices — optional; create in Stripe and set env when ready. */
export function getYearlySubscriptionPriceId(
  planId: SubscriptionPlanId,
  currency: BillingCheckoutCurrency = "usd",
): string | null {
  const mapUsd: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY,
    growth: process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY,
    pro: process.env.STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY,
    scale: process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY,
  };
  const mapEur: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER_YEARLY,
    growth: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH_YEARLY,
    pro: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_PRO_YEARLY,
    scale: process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE_YEARLY,
  };
  const map = currency === "eur" ? mapEur : mapUsd;
  const v = map[planId]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

export function getSubscriptionStripePriceId(
  planId: SubscriptionPlanId,
  billing: "monthly" | "yearly",
  currency: BillingCheckoutCurrency = "usd",
): string | null {
  return billing === "yearly"
    ? getYearlySubscriptionPriceId(planId, currency)
    : getMonthlySubscriptionPriceId(planId, currency);
}

/**
 * Reverse lookup: given a Stripe price ID, return the matching plan + billing.
 * Returns null if the price doesn't match any configured plan.
 */
export function getPlanFromPriceId(
  priceId: string,
): { planId: SubscriptionPlanId; billing: "monthly" | "yearly" } | null {
  if (!priceId) return null;
  const currencies: BillingCheckoutCurrency[] = ["usd", "eur"];
  for (const planId of SUBSCRIPTION_PLAN_IDS) {
    for (const c of currencies) {
      const monthly = getMonthlySubscriptionPriceId(planId, c);
      if (monthly && monthly === priceId) return { planId, billing: "monthly" };
      const yearly = getYearlySubscriptionPriceId(planId, c);
      if (yearly && yearly === priceId) return { planId, billing: "yearly" };
    }
  }
  return null;
}
