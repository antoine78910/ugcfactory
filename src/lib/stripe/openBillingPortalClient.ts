/**
 * Opens Stripe Customer Billing portal (plan changes / proration, payment method, invoices).
 * Server requires an existing `user_subscriptions.stripe_customer_id`.
 */
export async function openStripeBillingPortal(): Promise<void> {
  const res = await fetch("/api/stripe/billing-portal", {
    method: "POST",
    credentials: "include",
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Could not open billing portal");
  if (!data.url) throw new Error("No billing portal URL");
  window.location.href = data.url;
}
