export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { loadUserSubscriptionRow } from "@/lib/stripe/subscriptionUpgrade";
import {
  hasUsedRetentionDiscount,
  STRIPE_METADATA_RETENTION_30_APPLIED,
} from "@/lib/stripe/retentionDiscount";

const RETENTION_COUPON_NAME = "Retention 30% off — 1 month";
const RETENTION_PERCENT_OFF = 30;

export async function POST() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const row = await loadUserSubscriptionRow(auth.user.id);
  if (!row) {
    return NextResponse.json({ error: "No subscription on file." }, { status: 404 });
  }
  if (row.status !== "active" && row.status !== "trialing") {
    return NextResponse.json({ error: "Subscription is not active." }, { status: 409 });
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  let customer: Stripe.Customer;
  try {
    const c = await stripe.customers.retrieve(row.stripe_customer_id);
    if (c.deleted || !("metadata" in c)) {
      return NextResponse.json({ error: "Could not load customer." }, { status: 502 });
    }
    customer = c;
  } catch {
    return NextResponse.json({ error: "Could not load customer." }, { status: 502 });
  }

  if (hasUsedRetentionDiscount(customer.metadata)) {
    return NextResponse.json(
      { error: "You have already used the retention discount. It can only be applied once per account." },
      { status: 409 },
    );
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch {
    return NextResponse.json({ error: "Could not load subscription." }, { status: 502 });
  }

  if ((subscription as { discount?: { coupon?: unknown } }).discount?.coupon) {
    return NextResponse.json(
      { error: "A discount is already applied to your subscription." },
      { status: 409 },
    );
  }

  try {
    const coupon = await stripe.coupons.create({
      percent_off: RETENTION_PERCENT_OFF,
      duration: "once",
      name: RETENTION_COUPON_NAME,
      max_redemptions: 1,
    });

    await stripe.subscriptions.update(subscription.id, {
      discounts: [{ coupon: coupon.id }],
    });

    await stripe.customers.update(customer.id, {
      metadata: {
        ...customer.metadata,
        [STRIPE_METADATA_RETENTION_30_APPLIED]: "true",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not apply discount.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
