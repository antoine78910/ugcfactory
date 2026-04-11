import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";

/** Display amounts for marketing UI (matches `/api/billing/stripe-display-prices` rules). */
export function formatMoneyAmount(amount: number, currency: BillingCheckoutCurrency): string {
  if (currency === "eur") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
