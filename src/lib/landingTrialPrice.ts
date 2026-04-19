/**
 * Landing page trial price display from request country (IP-derived on Vercel: `x-vercel-ip-country`).
 * Default is US-style `$1`; Eurozone shows amount-first `1€`.
 */

/** ISO 3166-1 alpha-2, Eurozone + microstates using EUR. */
const EUROZONE_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "AD",
  "MC",
  "SM",
  "VA",
]);

export type LandingTrialCurrency = "eur" | "usd";

export function landingTrialCurrencyFromCountry(countryCode: string | null | undefined): LandingTrialCurrency {
  const c = (countryCode ?? "").trim().toUpperCase();
  if (c.length !== 2) return "usd";
  return EUROZONE_COUNTRY_CODES.has(c) ? "eur" : "usd";
}

/** Short snippet for buttons (e.g. `$1` vs `1€`). */
export function landingTrialPriceSnippet(currency: LandingTrialCurrency): string {
  return currency === "eur" ? "1€" : "$1";
}

/**
 * Resolve country from standard edge / CDN headers (no extra HTTP calls).
 */
export function landingCountryFromHeaders(getHeader: (name: string) => string | null): string | undefined {
  const raw =
    getHeader("x-vercel-ip-country") ??
    getHeader("cf-ipcountry") ??
    getHeader("x-appengine-country") ??
    "";
  const c = raw.trim().toUpperCase();
  if (c.length === 2 && /^[A-Z]{2}$/.test(c)) return c;
  return undefined;
}
