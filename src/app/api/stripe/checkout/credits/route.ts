import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCreditPackStripePriceId, isCreditPackKey } from "@/lib/stripe/creditPackPrices";

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

  const packKey =
    typeof body === "object" && body !== null && "packKey" in body
      ? String((body as { packKey: unknown }).packKey)
      : "";

  if (!isCreditPackKey(packKey)) {
    return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  const priceId = getCreditPackStripePriceId(packKey);
  if (!priceId) {
    return NextResponse.json(
      { error: "Credit pack price not configured in env." },
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
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/credits?checkout=success`,
      cancel_url: `${base.replace(/\/$/, "")}/credits?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { credit_pack: packKey },
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
