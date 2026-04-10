export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import {
  billingCheckoutCurrencyFromRequest,
  getBillingCountryFromHeaders,
} from "@/lib/geo/billingRegion";
import { CREDIT_PACK_KEYS, getCreditPackStripePriceId } from "@/lib/stripe/creditPackPrices";
import { CREDIT_PACKS, SUBSCRIPTIONS } from "@/lib/pricing";
import {
  SUBSCRIPTION_PLAN_IDS,
  getSubscriptionStripePriceId,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";

function intlCurrency(currency: StripeDisplayPricesPayload["currency"]) {
  if (currency === "eur") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function moneyFromUnitAmount(
  unitAmount: number | null | undefined,
  nf: Intl.NumberFormat,
): { amount: number; formatted: string } | null {
  if (unitAmount == null || !Number.isFinite(unitAmount)) return null;
  const amount = unitAmount / 100;
  return { amount, formatted: nf.format(amount) };
}

/** Static USD fallback when Stripe is unavailable (no secret or fetch error). */
function usdFallbackPayload(country: string | null): StripeDisplayPricesPayload {
  const nf = intlCurrency("usd");
  const creditPacks: StripeDisplayPricesPayload["creditPacks"] = {};
  CREDIT_PACK_KEYS.forEach((key, i) => {
    const row = CREDIT_PACKS[i];
    if (!row) return;
    const m = moneyFromUnitAmount(Math.round(row.price_usd * 100), nf);
    if (m) creditPacks[key] = m;
  });
  const subscriptions: StripeDisplayPricesPayload["subscriptions"] = {};
  SUBSCRIPTION_PLAN_IDS.forEach((planId, i) => {
    const row = SUBSCRIPTIONS[i];
    if (!row) return;
    const monthly = moneyFromUnitAmount(Math.round(row.price_usd * 100), nf);
    const yAmount = row.price_usd * 8.4;
    const yearly = moneyFromUnitAmount(Math.round(yAmount * 100), nf);
    const perMonthAmount = row.price_usd * 0.7;
    subscriptions[planId] = {
      monthly,
      yearly:
        yearly && monthly
          ? {
              ...yearly,
              perMonthAmount,
              perMonthFormatted: nf.format(perMonthAmount),
            }
          : null,
    };
  });
  return { currency: "usd", country, creditPacks, subscriptions };
}

function collectStripeJobs(currency: StripeDisplayPricesPayload["currency"]) {
  type Job = { kind: "pack"; key: (typeof CREDIT_PACK_KEYS)[number]; id: string } | {
    kind: "sub";
    planId: SubscriptionPlanId;
    billing: "monthly" | "yearly";
    id: string;
  };
  const jobs: Job[] = [];
  for (const key of CREDIT_PACK_KEYS) {
    const id = getCreditPackStripePriceId(key, currency);
    if (id) jobs.push({ kind: "pack", key, id });
  }
  for (const planId of SUBSCRIPTION_PLAN_IDS) {
    const mid = getSubscriptionStripePriceId(planId, "monthly", currency);
    if (mid) jobs.push({ kind: "sub", planId, billing: "monthly", id: mid });
    const yid = getSubscriptionStripePriceId(planId, "yearly", currency);
    if (yid) jobs.push({ kind: "sub", planId, billing: "yearly", id: yid });
  }
  return jobs;
}

export async function GET(req: Request) {
  const country = getBillingCountryFromHeaders(req.headers);
  let currency = billingCheckoutCurrencyFromRequest(req);

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json(usdFallbackPayload(country));
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  let jobs = collectStripeJobs(currency);
  if (jobs.length === 0 && currency === "eur") {
    currency = "usd";
    jobs = collectStripeJobs(currency);
  }
  if (jobs.length === 0) {
    return NextResponse.json(usdFallbackPayload(country));
  }

  const nf = intlCurrency(currency);

  try {
    const prices = await Promise.all(jobs.map((j) => stripe.prices.retrieve(j.id)));

    const creditPacks: StripeDisplayPricesPayload["creditPacks"] = {};
    const subscriptions: StripeDisplayPricesPayload["subscriptions"] = {};

    jobs.forEach((j, idx) => {
      const p = prices[idx];
      const m = moneyFromUnitAmount(p.unit_amount, nf);
      if (j.kind === "pack") {
        if (m) creditPacks[j.key] = m;
        return;
      }
      const cur = subscriptions[j.planId] ?? { monthly: null, yearly: null };
      if (j.billing === "monthly") {
        cur.monthly = m;
      } else if (m && p.recurring?.interval === "year") {
        const perMonthAmount = m.amount / 12;
        cur.yearly = {
          ...m,
          perMonthAmount,
          perMonthFormatted: nf.format(perMonthAmount),
        };
      } else if (m) {
        cur.yearly = {
          ...m,
          perMonthAmount: m.amount / 12,
          perMonthFormatted: nf.format(m.amount / 12),
        };
      }
      subscriptions[j.planId] = cur;
    });

    const payload: StripeDisplayPricesPayload = {
      currency,
      country,
      creditPacks,
      subscriptions,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[billing/stripe-display-prices]", e);
    return NextResponse.json(usdFallbackPayload(country));
  }
}
