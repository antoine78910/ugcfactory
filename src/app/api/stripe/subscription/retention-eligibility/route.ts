export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { loadUserSubscriptionRow } from "@/lib/stripe/subscriptionUpgrade";
import { hasUsedRetentionDiscount } from "@/lib/stripe/retentionDiscount";

/**
 * Returns whether the user can see the one-time -30% retention offer in the cancel flow.
 * `eligible: false` if they already claimed it (Stripe customer metadata).
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ eligible: false, error: "Stripe is not configured." }, { status: 503 });
  }

  const row = await loadUserSubscriptionRow(auth.user.id);
  if (!row?.stripe_customer_id?.trim()) {
    return NextResponse.json({ eligible: false });
  }

  try {
    const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
    const customer = await stripe.customers.retrieve(row.stripe_customer_id);
    if (customer.deleted) {
      return NextResponse.json({ eligible: false });
    }
    const used = hasUsedRetentionDiscount(customer.metadata);
    return NextResponse.json({ eligible: !used });
  } catch {
    return NextResponse.json({ eligible: false });
  }
}
