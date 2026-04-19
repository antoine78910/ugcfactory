import { NextResponse } from "next/server";
import Stripe from "stripe";
import { billingCheckoutCurrencyFromRequest } from "@/lib/geo/billingRegion";
import { dubCheckoutSessionMetadata } from "@/lib/dub/stripeSessionMetadata";
import { getDataFastStripeMetadata } from "@/lib/stripe/datafastMetadata";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { firstStripePriceId } from "@/lib/stripe/stripePriceEnv";

function getTrialPriceId(currency: "usd" | "eur"): string | null {
  if (currency === "eur") {
    return firstStripePriceId(
      process.env.STRIPE_PRICE_TRIAL_EUR,
      process.env.NEXT_PUBLIC_STRIPE_PRICE_TRIAL_EUR,
    );
  }
  return firstStripePriceId(
    process.env.STRIPE_PRICE_TRIAL_USD,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_TRIAL_USD,
  );
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const currency = billingCheckoutCurrencyFromRequest(req);
  const priceId = getTrialPriceId(currency);

  if (!priceId) {
    return NextResponse.json(
      { error: "Trial price not configured. Set STRIPE_PRICE_TRIAL_USD / STRIPE_PRICE_TRIAL_EUR." },
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
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/?checkout=trial_success`,
      cancel_url: `${base.replace(/\/$/, "")}/setup?checkout=cancel`,
      allow_promotion_codes: false,
      metadata: {
        user_id: auth.user.id,
        /** Identifies this as a trial credit grant (30 credits) */
        credit_trial: "1",
        /** Never fire Dub partner commission on $1 trial */
        dub_skip_sale: "1",
        ...dubCheckoutSessionMetadata(auth.user.id),
        ...datafastMeta,
      },
      ...(customerEmail ? { customer_email: customerEmail } : {}),
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
