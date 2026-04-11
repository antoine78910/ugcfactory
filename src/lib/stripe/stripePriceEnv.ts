/**
 * Resolve Stripe Price IDs from env. Accepts several naming styles so Vercel / .env
 * matches what operators expect (server-only vs NEXT_PUBLIC, EUR prefix vs _EUR suffix).
 */
export function firstStripePriceId(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    const v = c?.trim();
    if (v && v.startsWith("price_")) return v;
  }
  return null;
}
