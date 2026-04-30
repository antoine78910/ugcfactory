export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";

function resolveStripePublishableKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE?.trim() ||
    "";
  return key || null;
}

async function resolveStripeCustomerId(
  userId: string,
  email: string | null,
  admin: ReturnType<typeof createSupabaseServiceClient>,
  stripe: Stripe,
): Promise<string | null> {
  if (admin) {
    const { data } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dbId = data?.stripe_customer_id?.trim();
    if (dbId) return dbId;
  }

  if (!email) return null;
  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data[0]?.id ?? null;
}

export async function POST() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const publishableKey = resolveStripePublishableKey();
  if (!secret || !publishableKey) {
    return NextResponse.json(
      { error: "Stripe is not fully configured (missing secret or publishable key)." },
      { status: 503 },
    );
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  try {
    const customerId = await resolveStripeCustomerId(auth.user.id, email, admin, stripe);
    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found for this account." }, { status: 404 });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
    });

    return NextResponse.json({
      data: {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        publishableKey,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not initialize payment recovery.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

