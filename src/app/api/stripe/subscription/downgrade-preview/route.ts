export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { normalizeStripeCurrency } from "@/lib/geo/billingRegion";
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

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

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
    return NextResponse.json({ error: "No active subscription." }, { status: 404 });
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
  if (change !== "downgrade") {
    return NextResponse.json({ error: "This is not a downgrade." }, { status: 400 });
  }

  let effectiveAt = "the end of your current billing period";
  let currency: "usd" | "eur" = "usd";
  let currentPrice = subscriptionPriceDisplayUsd(currentPlanId, currentBilling);
  let targetPrice = subscriptionPriceDisplayUsd(targetPlanId, targetBilling);

  try {
    const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    currency = normalizeStripeCurrency(sub.currency);
    const periodEnd = (sub as any).current_period_end;
    if (typeof periodEnd === "number" && periodEnd > 0) {
      const d = new Date(periodEnd * 1000);
      effectiveAt = d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    const curPid = getSubscriptionStripePriceId(currentPlanId, currentBilling, currency);
    const tgtPid = getSubscriptionStripePriceId(targetPlanId, targetBilling, currency);
    if (curPid) {
      const p = await stripe.prices.retrieve(curPid);
      if (p.unit_amount != null) currentPrice = p.unit_amount / 100;
    }
    if (tgtPid) {
      const p = await stripe.prices.retrieve(tgtPid);
      if (p.unit_amount != null) targetPrice = p.unit_amount / 100;
    }
  } catch {
    /* use generic label + catalog fallback */
  }

  return NextResponse.json({
    currency,
    current: {
      planId: currentPlanId,
      name: planLabel(currentPlanId),
      billingLabel: currentBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: currentPrice,
      creditsPerMonth: subscriptionCreditsPerMonth(currentPlanId),
    },
    target: {
      planId: targetPlanId,
      name: planLabel(targetPlanId),
      billingLabel: targetBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: targetPrice,
      creditsPerMonth: subscriptionCreditsPerMonth(targetPlanId),
    },
    effectiveAt,
  });
}
