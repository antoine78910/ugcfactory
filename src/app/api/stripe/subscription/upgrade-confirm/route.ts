export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { dubCheckoutSessionMetadata } from "@/lib/dub/stripeSessionMetadata";
import { getDataFastStripeMetadata } from "@/lib/stripe/datafastMetadata";
import { normalizeStripeCurrency } from "@/lib/geo/billingRegion";
import {
  classifySubscriptionChange,
  isSubscriptionPlanId,
  loadUserSubscriptionRow,
  parseDbBilling,
  getSubscriptionStripePriceId,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionUpgrade";

const CREDIT_PRORATION_VALUE_USD = 0.07;

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
    return NextResponse.json({ error: "No subscription on file." }, { status: 404 });
  }

  if (row.status !== "active" && row.status !== "trialing") {
    return NextResponse.json({ error: "Subscription is not active." }, { status: 409 });
  }

  const currentPlanRaw = row.plan_id;
  if (!isSubscriptionPlanId(currentPlanRaw)) {
    return NextResponse.json({ error: "Could not read current plan." }, { status: 422 });
  }
  const currentPlanId = currentPlanRaw as SubscriptionPlanId;
  const currentBilling = parseDbBilling(row.billing) ?? "monthly";

  const change = classifySubscriptionChange({
    currentPlanId,
    currentBilling,
    targetPlanId,
    targetBilling,
  });
  if (change !== "ok") {
    return NextResponse.json(
      { error: "This change must be done from the billing portal." },
      { status: 400 },
    );
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  let subCurrency = "usd" as "usd" | "eur";
  try {
    const existing = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    subCurrency = normalizeStripeCurrency(existing.currency);
  } catch {
    return NextResponse.json({ error: "Could not load Stripe subscription." }, { status: 502 });
  }

  const newPriceId = getSubscriptionStripePriceId(targetPlanId, targetBilling, subCurrency);
  if (!newPriceId) {
    return NextResponse.json({ error: "Price is not configured for this plan." }, { status: 422 });
  }

  let prorationCreditCents = 0;
  let unusedCreditsCount = 0;
  try {
    const admin = createSupabaseServiceClient();
    if (admin) {
      const bal = await getUserCreditBalance(admin, auth.user.id);
      unusedCreditsCount = bal.subscriptionCredits;
      prorationCreditCents = Math.round(unusedCreditsCount * CREDIT_PRORATION_VALUE_USD * 100);
    }
  } catch {
    /* best-effort */
  }

  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const datafastMeta = await getDataFastStripeMetadata();

  try {
    let couponId: string | undefined;
    if (prorationCreditCents > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: prorationCreditCents,
        currency: subCurrency,
        duration: "once",
        name: `Proration: ${unusedCreditsCount} unused credits × $0.07`,
        max_redemptions: 1,
      });
      couponId = coupon.id;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: newPriceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/subscription?checkout=success&plan=${encodeURIComponent(targetPlanId)}`,
      cancel_url: `${base.replace(/\/$/, "")}/subscription?checkout=cancel`,
      customer: row.stripe_customer_id,
      metadata: {
        user_id: auth.user.id,
        subscription_plan: targetPlanId,
        subscription_billing: targetBilling,
        upgrade_from_subscription_id: row.stripe_subscription_id,
        ...dubCheckoutSessionMetadata(auth.user.id),
        ...datafastMeta,
      },
    };

    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
