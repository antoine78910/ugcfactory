import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";

/** fr-FR currency inserts a space / narrow no-break space before €; strip for compact display. */
export function compactEurCurrencyFormat(formatted: string): string {
  return formatted.replace(/[\s\u00a0\u202f]+€/u, "€");
}

/** Display amounts for marketing UI (matches `/api/billing/stripe-display-prices` rules). */
export function formatMoneyAmount(amount: number, currency: BillingCheckoutCurrency): string {
  if (currency === "eur") {
    return compactEurCurrencyFormat(
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount),
    );
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
