/**
 * Dub listens to Stripe and matches purchases to clicks when this key is set on Checkout sessions.
 * Must match the same user id used for `track.lead` (`customerExternalId`), typically Supabase `user.id`.
 * @see https://dub.co/docs/integrations/stripe
 */
export function dubCheckoutSessionMetadata(userId: string): {
  dubCustomerExternalId: string;
} {
  return { dubCustomerExternalId: userId };
}
