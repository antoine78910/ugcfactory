export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";

type Body = {
  setupIntentId?: string;
};

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

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Stripe is not configured (missing STRIPE_SECRET_KEY)." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const setupIntentId = (body.setupIntentId ?? "").trim();
  if (!setupIntentId) {
    return NextResponse.json({ error: "Missing setupIntentId." }, { status: 400 });
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  try {
    const customerId = await resolveStripeCustomerId(auth.user.id, email, admin, stripe);
    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found for this account." }, { status: 404 });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const siCustomer = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;
    if (!siCustomer || siCustomer !== customerId) {
      return NextResponse.json({ error: "Setup intent does not belong to this customer." }, { status: 403 });
    }
    if (setupIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Card setup is not completed yet." }, { status: 400 });
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    if (!paymentMethodId) {
      return NextResponse.json({ error: "No payment method found on setup intent." }, { status: 400 });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const delinquentStatuses: Stripe.SubscriptionListParams.Status[] = ["past_due", "unpaid", "incomplete"];
    let recoveredAny = false;
    for (const status of delinquentStatuses) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status,
        limit: 10,
      });
      for (const sub of subs.data) {
        await stripe.subscriptions.update(sub.id, {
          default_payment_method: paymentMethodId,
        });
        const latestInvoiceId =
          typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
        if (latestInvoiceId) {
          try {
            await stripe.invoices.pay(latestInvoiceId, { payment_method: paymentMethodId });
            recoveredAny = true;
          } catch {
            /* keep trying other subscriptions/invoices */
          }
        }
      }
    }

    return NextResponse.json({ data: { recovered: recoveredAny } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not confirm payment recovery.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

