export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { normalizeStripeCurrency } from "@/lib/geo/billingRegion";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getSubscriptionStripePriceId } from "@/lib/stripe/subscriptionPrices";
import {
  classifySubscriptionChange,
  isSubscriptionPlanId,
  loadUserSubscriptionRow,
  parseDbBilling,
  subscriptionCreditsPerMonth,
  subscriptionPriceDisplayUsd,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionUpgrade";

const CREDIT_PRORATION_VALUE_USD = 0.07;

function planLabel(planId: SubscriptionPlanId): string {
  const labels: Record<SubscriptionPlanId, string> = {
    starter: "Starter",
    growth: "Growth",
    pro: "Pro",
    scale: "Scale",
  };
  return labels[planId] ?? planId;
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planIdRaw =
    typeof body === "object" && body !== null && "planId" in body
      ? String((body as { planId: unknown }).planId)
      : "";
  const billingRaw =
    typeof body === "object" && body !== null && "billing" in body
      ? String((body as { billing: unknown }).billing)
      : "monthly";
  const targetBilling = billingRaw === "yearly" ? "yearly" : "monthly";

  if (!isSubscriptionPlanId(planIdRaw)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const targetPlanId = planIdRaw;

  const row = await loadUserSubscriptionRow(auth.user.id);
  if (!row) {
    return NextResponse.json(
      { error: "No active subscription on file. Use checkout to subscribe first." },
      { status: 404 },
    );
  }

  if (row.status !== "active" && row.status !== "trialing") {
    return NextResponse.json({ error: "Subscription is not active." }, { status: 409 });
  }

  const currentPlanRaw = row.plan_id;
  if (!isSubscriptionPlanId(currentPlanRaw)) {
    return NextResponse.json({ error: "Could not read current plan." }, { status: 422 });
  }
  const currentPlanId = currentPlanRaw;
  const currentBilling = parseDbBilling(row.billing) ?? "monthly";

  const change = classifySubscriptionChange({
    currentPlanId,
    currentBilling,
    targetPlanId,
    targetBilling,
  });
  if (change === "same") {
    return NextResponse.json({ error: "You already have this plan and billing." }, { status: 400 });
  }
  if (change === "downgrade") {
    return NextResponse.json(
      { error: "To switch to a lower tier, use Manage billing in the Stripe customer portal." },
      { status: 400 },
    );
  }

  let subscriptionCreditsRemaining = 0;
  try {
    const admin = createSupabaseServiceClient();
    if (admin) {
      const bal = await getUserCreditBalance(admin, auth.user.id);
      subscriptionCreditsRemaining = bal.subscriptionCredits;
    }
  } catch {
    /* best-effort */
  }

  const prorationCreditUsd =
    Math.round(subscriptionCreditsRemaining * CREDIT_PRORATION_VALUE_USD * 100) / 100;
  const prorationCreditCents = Math.round(prorationCreditUsd * 100);

  let checkoutCurrency: "usd" | "eur" = "usd";
  let targetPriceMajor = subscriptionPriceDisplayUsd(targetPlanId, targetBilling);
  let currentPriceMajor = subscriptionPriceDisplayUsd(currentPlanId, currentBilling);
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (secret) {
    try {
      const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
        expand: ["items.data.price"],
      });
      checkoutCurrency = normalizeStripeCurrency(sub.currency);
      const tid = getSubscriptionStripePriceId(targetPlanId, targetBilling, checkoutCurrency);
      const cid = getSubscriptionStripePriceId(currentPlanId, currentBilling, checkoutCurrency);
      if (tid) {
        const tp = await stripe.prices.retrieve(tid);
        if (tp.unit_amount != null) {
          targetPriceMajor = tp.unit_amount / 100;
        }
      }
      if (cid) {
        const cp = await stripe.prices.retrieve(cid);
        if (cp.unit_amount != null) {
          currentPriceMajor = cp.unit_amount / 100;
        }
      }
    } catch (e) {
      console.error("[upgrade-preview] Stripe price load:", e);
    }
  }

  const targetPriceCents = Math.round(targetPriceMajor * 100);
  const amountDueCents = Math.max(0, targetPriceCents - prorationCreditCents);

  const curSym = checkoutCurrency === "eur" ? "€" : "$";
  const renewalSummary =
    targetBilling === "yearly"
      ? `Your subscription renews at ${curSym}${targetPriceMajor.toFixed(2)}/mo (billed yearly), and you can cancel anytime from Manage billing.`
      : `Your subscription renews at ${curSym}${targetPriceMajor.toFixed(0)} per month, and you can cancel anytime from Manage billing.`;

  return NextResponse.json({
    current: {
      planId: currentPlanId,
      name: planLabel(currentPlanId),
      billingLabel: currentBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: currentPriceMajor,
    },
    target: {
      planId: targetPlanId,
      name: planLabel(targetPlanId),
      billingLabel: targetBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: targetPriceMajor,
      creditsPerMonth: subscriptionCreditsPerMonth(targetPlanId),
    },
    subscriptionCreditsRemaining,
    prorationCreditUsd,
    prorationCreditCents,
    amountDueCents,
    currency: checkoutCurrency,
    renewalSummary,
  });
}
