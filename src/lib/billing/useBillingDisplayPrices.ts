"use client";

import { useEffect, useState } from "react";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";

const LS_KEY = "lta_billing_display_prices_v1";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 h

type Cached = {
  ts: number;
  payload: StripeDisplayPricesPayload;
};

function readCache(): StripeDisplayPricesPayload | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const cached = JSON.parse(raw) as Cached;
    if (!cached?.ts || !cached?.payload) return null;
    if (Date.now() - cached.ts > TTL_MS) return null;
    return cached.payload;
  } catch {
    return null;
  }
}

function writeCache(payload: StripeDisplayPricesPayload) {
  try {
    const item: Cached = { ts: Date.now(), payload };
    localStorage.setItem(LS_KEY, JSON.stringify(item));
  } catch {
    /* quota / SSR – ignore */
  }
}

/**
 * Fetches `/api/billing/stripe-display-prices` on first call, then caches the result
 * in `localStorage` for 24 h so subsequent renders are instant and IP-based currency
 * is resolved once per session / day without repeated backend calls.
 */
export function useBillingDisplayPrices(): StripeDisplayPricesPayload | null {
  const [prices, setPrices] = useState<StripeDisplayPricesPayload | null>(() => readCache());

  useEffect(() => {
    if (readCache()) return; // already fresh
    let cancelled = false;
    fetch("/api/billing/stripe-display-prices", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as StripeDisplayPricesPayload;
        if (!cancelled) {
          writeCache(data);
          setPrices(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = buildUsdStripeDisplayPricesFallback(null);
          writeCache(fallback);
          setPrices(fallback);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return prices;
}
