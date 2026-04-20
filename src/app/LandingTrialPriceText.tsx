"use client";

import { useEffect, useState } from "react";

type Props = {
  /** SSR-safe default ($1) so the static LP can render without geo lookup. */
  fallback?: string;
  className?: string;
};

/**
 * Renders the landing-page trial price snippet (`$1` / `1€`) without forcing the
 * marketing page to opt out of static rendering.
 *
 * On mount, fetches `/api/landing/trial-currency` (edge, geo-headers based) and
 * swaps the displayed text in place. The fallback ($1) renders identically on
 * the server, so SEO / hero LCP is unaffected.
 */
export function LandingTrialPriceText({ fallback = "$1", className }: Props) {
  const [price, setPrice] = useState(fallback);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/landing/trial-currency", {
          signal: ctrl.signal,
          cache: "force-cache",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { price?: string };
        if (typeof data.price === "string" && data.price.length > 0 && data.price !== fallback) {
          setPrice(data.price);
        }
      } catch {
        /* ignore network/abort: fallback already rendered */
      }
    })();
    return () => ctrl.abort();
  }, [fallback]);

  return <span className={className}>{price}</span>;
}
