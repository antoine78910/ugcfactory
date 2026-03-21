/**
 * Stripe Price IDs for subscription checkout (monthly).
 * Set in env — see `.env.example`.
 */

export const SUBSCRIPTION_PLAN_IDS = ["starter", "growth", "pro", "scale"] as const;
export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLAN_IDS)[number];

export function isSubscriptionPlanId(id: string): id is SubscriptionPlanId {
  return (SUBSCRIPTION_PLAN_IDS as readonly string[]).includes(id);
}

/** Monthly recurring prices (Stripe Dashboard). */
export function getMonthlySubscriptionPriceId(planId: SubscriptionPlanId): string | null {
  const map: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER,
    growth: process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH,
    pro: process.env.STRIPE_PRICE_SUBSCRIPTION_PRO,
    scale: process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE,
  };
  const v = map[planId]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

/** Yearly prices — optional; create in Stripe and set env when ready. */
export function getYearlySubscriptionPriceId(planId: SubscriptionPlanId): string | null {
  const map: Record<SubscriptionPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_SUBSCRIPTION_STARTER_YEARLY,
    growth: process.env.STRIPE_PRICE_SUBSCRIPTION_GROWTH_YEARLY,
    pro: process.env.STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY,
    scale: process.env.STRIPE_PRICE_SUBSCRIPTION_SCALE_YEARLY,
  };
  const v = map[planId]?.trim();
  return v && v.startsWith("price_") ? v : null;
}

export function getSubscriptionStripePriceId(
  planId: SubscriptionPlanId,
  billing: "monthly" | "yearly",
): string | null {
  return billing === "yearly"
    ? getYearlySubscriptionPriceId(planId)
    : getMonthlySubscriptionPriceId(planId);
}
