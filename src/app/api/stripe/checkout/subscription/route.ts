import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getSubscriptionStripePriceId,
  isSubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe is not configured (missing STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId =
    typeof body === "object" && body !== null && "planId" in body
      ? String((body as { planId: unknown }).planId)
      : "";
  const billingRaw =
    typeof body === "object" && body !== null && "billing" in body
      ? String((body as { billing: unknown }).billing)
      : "monthly";
  const billing = billingRaw === "yearly" ? "yearly" : "monthly";

  if (!isSubscriptionPlanId(planId)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = getSubscriptionStripePriceId(planId, billing);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          billing === "yearly"
            ? "Yearly price not configured. Set STRIPE_PRICE_SUBSCRIPTION_*_YEARLY in env or choose Monthly."
            : "Subscription price not configured for this plan.",
      },
      { status: 422 },
    );
  }

  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/subscription?checkout=success`,
      cancel_url: `${base.replace(/\/$/, "")}/subscription?checkout=cancel`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
