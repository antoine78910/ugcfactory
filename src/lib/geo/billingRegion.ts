/**
 * EU / European checkout: use Stripe EUR price IDs (subscriptions + credit packs).
 * Country from Vercel (`x-vercel-ip-country`) or Cloudflare (`cf-ipcountry`).
 */

/** EU 27 + EEA (IS, LI, NO) + CH + UK + common European ISO 3166-1 alpha-2 codes. */
const EUROPE_CHECKOUT_EUR_ISO2 = new Set<string>([
  "AD",
  "AL",
  "AT",
  "BA",
  "BE",
  "BG",
  "BY",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FO",
  "FR",
  "GB",
  "GE",
  "GG",
  "GI",
  "GR",
  "HR",
  "HU",
  "IE",
  "IM",
  "IS",
  "IT",
  "JE",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MD",
  "ME",
  "MK",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "RS",
  "SE",
  "SI",
  "SK",
  "SM",
  "UA",
  "VA",
  "XK",
]);

export type BillingCheckoutCurrency = "usd" | "eur";

function normalizeIso2(raw: string | null | undefined): string | null {
  if (!raw || raw.length !== 2) return null;
  const u = raw.toUpperCase();
  if (u === "XX" || u === "T1") return null;
  return u;
}

/** Geo country from edge / hosting headers (no client trust). */
export function getBillingCountryFromHeaders(h: Headers): string | null {
  return normalizeIso2(
    h.get("x-vercel-ip-country") ||
      h.get("cf-ipcountry") ||
      h.get("cloudfront-viewer-country") ||
      undefined,
  );
}

/**
 * When IP country headers are missing (local dev, some proxies), infer checkout
 * currency from Accept-Language: `fr-FR`, `de-DE`, … → EUR; `en-US` → USD.
 */
export function billingCurrencyHintFromAcceptLanguage(h: Headers): BillingCheckoutCurrency | null {
  const raw = h.get("accept-language");
  if (!raw) return null;

  const nonEuRegions = new Set([
    "US",
    "CA",
    "AU",
    "NZ",
    "MX",
    "BR",
    "IN",
    "JP",
    "KR",
    "SG",
    "HK",
    "TW",
    "AR",
    "CL",
    "CO",
    "ZA",
  ]);

  for (const part of raw.split(",")) {
    const tag = part.trim().split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const segments = tag.split("-").filter(Boolean);
    const lang = segments[0] ?? "";
    if (segments.length >= 2) {
      const region = segments[segments.length - 1]!.toUpperCase();
      if (region.length === 2 && /^[A-Z]{2}$/.test(region)) {
        if (nonEuRegions.has(region)) return "usd";
        if (isEuropeEuCheckoutCountry(normalizeIso2(region))) return "eur";
      }
      continue;
    }
    // Language-only tag (e.g. `fr` without region)
    const euPrimaryLang = new Set([
      "fr",
      "de",
      "it",
      "es",
      "nl",
      "pt",
      "pl",
      "sv",
      "da",
      "fi",
      "no",
      "nb",
      "nn",
      "is",
      "el",
      "cs",
      "sk",
      "hu",
      "ro",
      "bg",
      "hr",
      "sl",
      "et",
      "lv",
      "lt",
      "ga",
      "mt",
      "lb",
      "eu",
      "ca",
    ]);
    if (euPrimaryLang.has(lang)) return "eur";
    if (lang === "en") return "usd";
  }
  return null;
}

export function isEuropeEuCheckoutCountry(iso2: string | null): boolean {
  if (!iso2) return false;
  return EUROPE_CHECKOUT_EUR_ISO2.has(iso2);
}

/**
 * `BILLING_FORCE_CURRENCY=usd|eur` overrides geo (local testing).
 * Otherwise EUR for European countries above, USD elsewhere / unknown.
 */
export function billingCheckoutCurrencyFromRequest(req: Request): BillingCheckoutCurrency {
  const forced = process.env.BILLING_FORCE_CURRENCY?.trim().toLowerCase();
  if (forced === "eur" || forced === "usd") return forced;

  const country = getBillingCountryFromHeaders(req.headers);
  if (isEuropeEuCheckoutCountry(country)) return "eur";

  const langHint = billingCurrencyHintFromAcceptLanguage(req.headers);
  if (langHint) return langHint;

  return "usd";
}

export function normalizeStripeCurrency(c: string | null | undefined): BillingCheckoutCurrency {
  return c?.toLowerCase() === "eur" ? "eur" : "usd";
}
