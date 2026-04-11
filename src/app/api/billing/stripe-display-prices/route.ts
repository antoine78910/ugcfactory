export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { compactEurCurrencyFormat } from "@/lib/billing/formatMoney";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";
import {
  billingCheckoutCurrencyFromRequest,
  getBillingCountryFromHeaders,
} from "@/lib/geo/billingRegion";
import { CREDIT_PACK_KEYS, getCreditPackStripePriceId } from "@/lib/stripe/creditPackPrices";
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
  let formatted = nf.format(amount);
  if (nf.resolvedOptions().currency === "EUR") {
    formatted = compactEurCurrencyFormat(formatted);
  }
  return { amount, formatted };
}

function formatWithNf(nf: Intl.NumberFormat, value: number): string {
  let s = nf.format(value);
  if (nf.resolvedOptions().currency === "EUR") {
    s = compactEurCurrencyFormat(s);
  }
  return s;
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
    return NextResponse.json(buildUsdStripeDisplayPricesFallback(country));
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  let jobs = collectStripeJobs(currency);
  if (jobs.length === 0 && currency === "eur") {
    currency = "usd";
    jobs = collectStripeJobs(currency);
  }
  if (jobs.length === 0) {
    return NextResponse.json(buildUsdStripeDisplayPricesFallback(country));
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
          perMonthFormatted: formatWithNf(nf, perMonthAmount),
        };
      } else if (m) {
        cur.yearly = {
          ...m,
          perMonthAmount: m.amount / 12,
          perMonthFormatted: formatWithNf(nf, m.amount / 12),
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
    return NextResponse.json(buildUsdStripeDisplayPricesFallback(country));
  }
}
