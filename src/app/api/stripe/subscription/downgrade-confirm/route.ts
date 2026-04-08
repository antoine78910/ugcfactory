export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { normalizeStripeCurrency } from "@/lib/geo/billingRegion";
import {
  classifySubscriptionChange,
  isSubscriptionPlanId,
  loadUserSubscriptionRow,
  parseDbBilling,
  resolveSubscriptionItemForPlan,
  getSubscriptionStripePriceId,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionUpgrade";

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
  if (change !== "downgrade") {
    return NextResponse.json({ error: "This is not a downgrade." }, { status: 400 });
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

  const subCurrency = normalizeStripeCurrency(subscription.currency);
  const newPriceId = getSubscriptionStripePriceId(targetPlanId, targetBilling, subCurrency);
  if (!newPriceId) {
    return NextResponse.json({ error: "Price is not configured for this plan." }, { status: 422 });
  }

  const item = resolveSubscriptionItemForPlan(
    subscription.items.data,
    currentPlanId,
    currentBilling,
  );
  if (!item?.id) {
    return NextResponse.json({ error: "Could not resolve subscription item." }, { status: 422 });
  }

  try {
    await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: item.id,
          price: newPriceId,
          quantity: item.quantity ?? 1,
        },
      ],
      proration_behavior: "none",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe could not update the subscription.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
