/**
 * Stripe Price IDs for subscription checkout (monthly).
 * Set in env, see `.env.example`.
 */

import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";
import { firstStripePriceId } from "@/lib/stripe/stripePriceEnv";

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
  if (currency === "eur") {
    const eur: Record<SubscriptionPlanId, string | null> = {
      starter: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER,
        process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_STARTER_EUR,
      ),
      growth: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH,
        process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_GROWTH_EUR,
      ),
      pro: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_PRO,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_PRO,
        process.env.STRIPE_PRICE_SUBSCRIPTION_PRO_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_EUR,
      ),
      scale: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE,
        process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_EUR,
      ),
    };
    return eur[planId];
  }
  const usd: Record<SubscriptionPlanId, string | null> = {
    starter: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_STARTER,
    ),
    growth: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_GROWTH,
    ),
    pro: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_PRO,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO,
    ),
    scale: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE,
    ),
  };
  return usd[planId];
}

/** Yearly prices, optional; create in Stripe and set env when ready. */
export function getYearlySubscriptionPriceId(
  planId: SubscriptionPlanId,
  currency: BillingCheckoutCurrency = "usd",
): string | null {
  if (currency === "eur") {
    const eur: Record<SubscriptionPlanId, string | null> = {
      starter: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER_YEARLY,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_STARTER_YEARLY,
        process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY_EUR,
      ),
      growth: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH_YEARLY,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_GROWTH_YEARLY,
        process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY_EUR,
      ),
      pro: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_PRO_YEARLY,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_PRO_YEARLY,
        process.env.STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY_EUR,
      ),
      scale: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE_YEARLY,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_SUBSCRIPTION_SCALE_YEARLY,
        process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY_EUR,
      ),
    };
    return eur[planId];
  }
  const usd: Record<SubscriptionPlanId, string | null> = {
    starter: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY,
    ),
    growth: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY,
    ),
    pro: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY,
    ),
    scale: firstStripePriceId(
      process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY,
    ),
  };
  return usd[planId];
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
