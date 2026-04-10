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

/** Browser hint before display-prices API resolves (client components only). */
export function inferClientBillingCurrency(): BillingCheckoutCurrency {
  if (typeof window === "undefined") return "usd";
  const langs = [navigator.language, ...(navigator.languages ?? [])].map((s) => String(s).toLowerCase());
  for (const l of langs) {
    if (l.startsWith("pt-br")) continue;
    if (l.startsWith("fr") || l.startsWith("de") || l.startsWith("it") || l.startsWith("nl") || l.startsWith("es")) {
      return "eur";
    }
    if (l.startsWith("pt")) return "eur";
  }
  return "usd";
}
