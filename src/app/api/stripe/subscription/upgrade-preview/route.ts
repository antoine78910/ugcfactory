export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PRICING_BASE } from "@/lib/pricing";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  classifySubscriptionChange,
  isSubscriptionPlanId,
  loadUserSubscriptionRow,
  parseDbBilling,
  resolveSubscriptionItemForPlan,
  getSubscriptionStripePriceId,
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

  const newPriceId = getSubscriptionStripePriceId(targetPlanId, targetBilling);
  if (!newPriceId) {
    return NextResponse.json(
      {
        error:
          targetBilling === "yearly"
            ? "Yearly price is not configured for this plan."
            : "Price is not configured for this plan.",
      },
      { status: 422 },
    );
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
      expand: ["items.data.price"],
    });
  } catch {
    return NextResponse.json({ error: "Could not load Stripe subscription." }, { status: 502 });
  }

  const item = resolveSubscriptionItemForPlan(subscription.items.data, currentPlanId, currentBilling);
  if (!item?.id) {
    return NextResponse.json({ error: "Could not resolve subscription item." }, { status: 422 });
  }

  let upcoming: Stripe.Invoice;
  try {
    upcoming = await stripe.invoices.createPreview({
      customer: row.stripe_customer_id,
      subscription: subscription.id,
      subscription_details: {
        items: [
          {
            id: item.id,
            price: newPriceId,
            quantity: item.quantity ?? 1,
          },
        ],
        proration_behavior: "create_prorations",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not preview invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let stripeProrationCreditCents = 0;
  for (const line of upcoming.lines.data) {
    const amt = line.amount ?? 0;
    if (amt < 0) stripeProrationCreditCents += amt;
  }

  let creditBalance = 0;
  let subscriptionCreditsRemaining = 0;
  try {
    const admin = createSupabaseServiceClient();
    if (admin) {
      const bal = await getUserCreditBalance(admin, auth.user.id);
      creditBalance = bal.balance;
      subscriptionCreditsRemaining = bal.subscriptionCredits;
    }
  } catch {
    /* optional */
  }

  const subscriptionCreditValueUsd =
    subscriptionCreditsRemaining > 0
      ? Math.round(subscriptionCreditsRemaining * PRICING_BASE.credit_value_usd * 100) / 100
      : 0;

  const amountDueCents = upcoming.amount_due ?? 0;
  const currency = (upcoming.currency ?? "usd").toLowerCase();

  const targetPriceUsd = subscriptionPriceDisplayUsd(targetPlanId, targetBilling);
  const renewalSummary =
    targetBilling === "yearly"
      ? `Your subscription renews at $${targetPriceUsd.toFixed(2)}/mo (billed yearly), and you can cancel anytime from Manage billing.`
      : `Your subscription renews at $${targetPriceUsd.toFixed(0)} per month, and you can cancel anytime from Manage billing.`;

  return NextResponse.json({
    current: {
      planId: currentPlanId,
      name: planLabel(currentPlanId),
      billingLabel: currentBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: subscriptionPriceDisplayUsd(currentPlanId, currentBilling),
    },
    target: {
      planId: targetPlanId,
      name: planLabel(targetPlanId),
      billingLabel: targetBilling === "yearly" ? "Yearly" : "Monthly",
      priceUsd: targetPriceUsd,
      creditsPerMonth: subscriptionCreditsPerMonth(targetPlanId),
    },
    creditBalance,
    subscriptionCreditsRemaining,
    subscriptionCreditValueUsd,
    stripeProrationCreditCents,
    amountDueCents,
    currency,
    renewalSummary,
  });
}
