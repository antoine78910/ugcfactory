export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error (Supabase admin)." }, { status: 503 });
  }

  const { data: row, error: qErr } = await admin
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (qErr) {
    return NextResponse.json({ error: "Could not load subscription." }, { status: 500 });
  }

  const customerId = row?.stripe_customer_id?.trim();
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer on file. Start a plan from the subscription page first, or contact support if you already pay.",
      },
      { status: 404 },
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured (missing STRIPE_SECRET_KEY)." }, { status: 503 });
  }

  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const returnUrl = `${base.replace(/\/$/, "")}/subscription`;

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!session.url) {
      return NextResponse.json({ error: "No portal URL returned from Stripe." }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
