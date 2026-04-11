import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import { CREDIT_PACKS, SUBSCRIPTIONS } from "@/lib/pricing";
import { CREDIT_PACK_KEYS } from "@/lib/stripe/creditPackPrices";
import { SUBSCRIPTION_PLAN_IDS } from "@/lib/stripe/subscriptionPrices";

/**
 * Static USD display when Stripe is unavailable or the display-prices request fails.
 * Matches `/api/billing/stripe-display-prices` shape (no network / IP).
 */
export function buildUsdStripeDisplayPricesFallback(
  country: string | null = null,
): StripeDisplayPricesPayload {
  const creditPacks: StripeDisplayPricesPayload["creditPacks"] = {};
  CREDIT_PACK_KEYS.forEach((key, i) => {
    const row = CREDIT_PACKS[i];
    if (!row) return;
    const amount = row.price_usd;
    creditPacks[key] = { amount, formatted: formatMoneyAmount(amount, "usd") };
  });

  const subscriptions: StripeDisplayPricesPayload["subscriptions"] = {};
  SUBSCRIPTION_PLAN_IDS.forEach((planId, i) => {
    const row = SUBSCRIPTIONS[i];
    if (!row) return;
    const monthlyAmount = row.price_usd;
    const monthly = {
      amount: monthlyAmount,
      formatted: formatMoneyAmount(monthlyAmount, "usd"),
    };
    const yearlyTotal = row.price_usd * 8.4;
    const perMonthAmount = row.price_usd * 0.7;
    subscriptions[planId] = {
      monthly,
      yearly: {
        amount: yearlyTotal,
        formatted: formatMoneyAmount(yearlyTotal, "usd"),
        perMonthAmount,
        perMonthFormatted: formatMoneyAmount(perMonthAmount, "usd"),
      },
    };
  });

  return { currency: "usd", country, creditPacks, subscriptions };
}
