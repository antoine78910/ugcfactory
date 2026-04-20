import { NextResponse } from "next/server";
import {
  landingCountryFromHeaders,
  landingTrialCurrencyFromCountry,
  landingTrialPriceSnippet,
} from "@/lib/landingTrialPrice";

/**
 * Tiny edge route used by the static landing page to swap `$1` ↔ `1€` based on
 * Vercel/CF geo headers, without forcing the marketing page itself to be dynamic.
 *
 * Cached aggressively at the edge per country bucket; safe because the response
 * body only depends on `x-vercel-ip-country` / `cf-ipcountry`.
 */
export const runtime = "edge";

export async function GET(req: Request) {
  const country = landingCountryFromHeaders((name) => req.headers.get(name));
  const currency = landingTrialCurrencyFromCountry(country);
  const price = landingTrialPriceSnippet(currency);

  return NextResponse.json(
    { currency, price, country: country ?? null },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
        Vary: "x-vercel-ip-country, cf-ipcountry",
      },
    },
  );
}
