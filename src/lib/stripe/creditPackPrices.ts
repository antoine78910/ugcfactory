/**
 * One-time credit pack Stripe Price IDs.
 * Keys match `PACK_UI` keys on `/credits` (same order as `CREDIT_PACKS` in `@/lib/pricing`).
 *
 * Stripe naming (user order): Scale → Pro → Growth → Boost → Launch
 */

export const CREDIT_PACK_KEYS = ["starter", "growth", "most-popular", "pro", "scale"] as const;
export type CreditPackKey = (typeof CREDIT_PACK_KEYS)[number];

export function isCreditPackKey(key: string): key is CreditPackKey {
  return (CREDIT_PACK_KEYS as readonly string[]).includes(key);
}

/** Launch ($30), Growth, Boost ($120), Pro, Scale — see `.env.example` */
export function getCreditPackStripePriceId(packKey: CreditPackKey): string | null {
  const map: Record<CreditPackKey, string | undefined> = {
    /** Launch pack */
    starter: process.env.STRIPE_PRICE_CREDITS_LAUNCH,
    growth: process.env.STRIPE_PRICE_CREDITS_GROWTH,
    /** Boost / Most Popular */
    "most-popular": process.env.STRIPE_PRICE_CREDITS_BOOST,
    pro: process.env.STRIPE_PRICE_CREDITS_PRO,
    scale: process.env.STRIPE_PRICE_CREDITS_SCALE,
  };
  const v = map[packKey]?.trim();
  return v && v.startsWith("price_") ? v : null;
}
