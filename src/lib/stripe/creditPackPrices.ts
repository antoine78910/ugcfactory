/**
 * One-time credit pack Stripe Price IDs.
 * Keys match `PACK_UI` keys on `/credits` (same order as `CREDIT_PACKS` in `@/lib/pricing`).
 *
 * EUR env: STRIPE_PRICE_EUR_CREDITS_GROWTH → pack `growth` (450 cr). STRIPE_PRICE_EUR_CREDITS_BOOST → `most-popular` (1000 cr). Use the same Scale→Launch price order as in Stripe / USD env (Growth = 3rd EUR id, Boost = 4th).
 */

import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";
import { firstStripePriceId } from "@/lib/stripe/stripePriceEnv";

export const CREDIT_PACK_KEYS = ["starter", "growth", "most-popular", "pro", "scale"] as const;
export type CreditPackKey = (typeof CREDIT_PACK_KEYS)[number];

export function isCreditPackKey(key: string): key is CreditPackKey {
  return (CREDIT_PACK_KEYS as readonly string[]).includes(key);
}

/** Launch, Growth, Boost, Pro, Scale — see `.env.example` */
export function getCreditPackStripePriceId(
  packKey: CreditPackKey,
  currency: BillingCheckoutCurrency = "usd",
): string | null {
  if (currency === "eur") {
    const eur: Record<CreditPackKey, string | null> = {
      starter: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_CREDITS_LAUNCH,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_CREDITS_LAUNCH,
        process.env.STRIPE_PRICE_CREDITS_LAUNCH_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LAUNCH_EUR,
      ),
      growth: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_CREDITS_GROWTH,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_CREDITS_GROWTH,
        process.env.STRIPE_PRICE_CREDITS_GROWTH_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_GROWTH_EUR,
      ),
      "most-popular": firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_CREDITS_BOOST,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_CREDITS_BOOST,
        process.env.STRIPE_PRICE_CREDITS_BOOST_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BOOST_EUR,
      ),
      pro: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_CREDITS_PRO,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_CREDITS_PRO,
        process.env.STRIPE_PRICE_CREDITS_PRO_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PRO_EUR,
      ),
      scale: firstStripePriceId(
        process.env.STRIPE_PRICE_EUR_CREDITS_SCALE,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_EUR_CREDITS_SCALE,
        process.env.STRIPE_PRICE_CREDITS_SCALE_EUR,
        process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SCALE_EUR,
      ),
    };
    return eur[packKey];
  }
  const usd: Record<CreditPackKey, string | null> = {
    starter: firstStripePriceId(
      process.env.STRIPE_PRICE_CREDITS_LAUNCH,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LAUNCH,
    ),
    growth: firstStripePriceId(
      process.env.STRIPE_PRICE_CREDITS_GROWTH,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_GROWTH,
    ),
    "most-popular": firstStripePriceId(
      process.env.STRIPE_PRICE_CREDITS_BOOST,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BOOST,
    ),
    pro: firstStripePriceId(
      process.env.STRIPE_PRICE_CREDITS_PRO,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PRO,
    ),
    scale: firstStripePriceId(
      process.env.STRIPE_PRICE_CREDITS_SCALE,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SCALE,
    ),
  };
  return usd[packKey];
}
