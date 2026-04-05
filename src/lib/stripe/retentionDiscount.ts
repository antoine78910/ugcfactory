import type Stripe from "stripe";

/** Stripe Customer metadata key — set to `"true"` after the one-time 30% retention discount is applied. */
export const STRIPE_METADATA_RETENTION_30_APPLIED = "retention_30_applied";

export function hasUsedRetentionDiscount(metadata: Stripe.Metadata | null | undefined): boolean {
  return metadata?.[STRIPE_METADATA_RETENTION_30_APPLIED] === "true";
}
