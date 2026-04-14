import { NextResponse } from "next/server";
import Stripe from "stripe";
import { billingCheckoutCurrencyFromRequest } from "@/lib/geo/billingRegion";
import {
  getSubscriptionStripePriceId,
  isSubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import { dubCheckoutSessionMetadata } from "@/lib/dub/stripeSessionMetadata";
import { getDataFastStripeMetadata } from "@/lib/stripe/datafastMetadata";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

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
  /** LinkJolt: `window.linkjolt.referral` → Stripe `client_reference_id` for affiliate attribution. */
  const referral =
    typeof body === "object" && body !== null && "referral" in body
      ? String((body as { referral: unknown }).referral).slice(0, 500)
      : "";

  if (!isSubscriptionPlanId(planId)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const checkoutCurrency = billingCheckoutCurrencyFromRequest(req);
  const priceId = getSubscriptionStripePriceId(planId, billing, checkoutCurrency);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          billing === "yearly"
            ? `Yearly price not configured for ${checkoutCurrency.toUpperCase()}. Set the matching STRIPE_PRICE_* env vars or choose Monthly.`
            : `Subscription price not configured for this plan (${checkoutCurrency.toUpperCase()}).`,
      },
      { status: 422 },
    );
  }

  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
  const customerEmail = auth.user.email?.trim();
  const datafastMeta = await getDataFastStripeMetadata();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/subscription?checkout=success&plan=${encodeURIComponent(planId)}`,
      cancel_url: `${base.replace(/\/$/, "")}/subscription?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: {
        user_id: auth.user.id,
        subscription_plan: planId,
        subscription_billing: billing,
        ...dubCheckoutSessionMetadata(auth.user.id),
        ...datafastMeta,
      },
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(referral ? { client_reference_id: referral } : {}),
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
