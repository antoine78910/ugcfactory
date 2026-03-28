export const runtime = "nodejs";

/**
 * Stripe webhook — verifies signature then updates DB.
 * URL: https://app.youry.io/api/stripe/webhook
 * Events to enable in Stripe Dashboard:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_succeeded  (monthly credit renewal)
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isSubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { isCreditPackKey } from "@/lib/stripe/creditPackPrices";
import { serverLog } from "@/lib/serverLog";

// Credit pack key → credits amount (must stay in sync with pricing.ts CREDIT_PACKS)
const CREDIT_PACK_CREDITS: Record<string, number> = {
  starter: 200,
  growth: 450,
  "most-popular": 1000,
  pro: 2200,
  scale: 5000,
};

// Subscription plan → monthly credits (must stay in sync with pricing.ts SUBSCRIPTIONS)
const SUBSCRIPTION_CREDITS: Record<string, number> = {
  starter: 240,
  growth: 600,
  pro: 1400,
  scale: 3200,
};

async function grantCredits(admin: ReturnType<typeof createSupabaseServiceClient>, userId: string, amount: number) {
  if (!admin || amount <= 0) return;
  // Upsert: create the row if it doesn't exist, then increment
  await admin.rpc("increment_user_credits", { p_user_id: userId, p_amount: amount });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret || !webhookSecret) {
    serverLog("stripe_webhook_misconfigured", { hasSecret: Boolean(secret), hasWebhook: Boolean(webhookSecret) });
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed.";
    serverLog("stripe_webhook_bad_signature", { error: msg });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    serverLog("stripe_webhook_no_admin_client");
    return NextResponse.json({ error: "DB not configured." }, { status: 503 });
  }

  try {
    switch (event.type) {

      // -----------------------------------------------------------------------
      // Checkout completed — subscription start OR one-time credit pack
      // -----------------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) {
          serverLog("stripe_webhook_no_user_id", { sessionId: session.id });
          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const planId = session.metadata?.subscription_plan ?? "";
          const billing = (session.metadata?.subscription_billing === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";

          if (isSubscriptionPlanId(planId)) {
            await admin.from("user_subscriptions").upsert({
              user_id: userId,
              stripe_subscription_id: sub.id,
              stripe_customer_id: String(sub.customer),
              plan_id: planId,
              billing,
              status: sub.status,
              current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
            }, { onConflict: "user_id" });

            // Grant first month credits
            const credits = SUBSCRIPTION_CREDITS[planId] ?? 0;
            await grantCredits(admin, userId, credits);
            serverLog("stripe_webhook_subscription_start", { userId, planId, credits });
          }
        }

        if (session.mode === "payment") {
          const packKey = session.metadata?.credit_pack ?? "";
          if (isCreditPackKey(packKey)) {
            const credits = CREDIT_PACK_CREDITS[packKey] ?? 0;
            await grantCredits(admin, userId, credits);
            serverLog("stripe_webhook_credits_granted", { userId, packKey, credits });
          }
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Monthly renewal — grant subscription credits
      // -----------------------------------------------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only for subscription renewals (not the first invoice — that's handled above)
        if ((invoice as any).billing_reason !== "subscription_cycle") break;

        const subId = typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null;
        if (!subId) break;

        const { data: row } = await admin
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (row?.user_id && row.plan_id) {
          const credits = SUBSCRIPTION_CREDITS[row.plan_id] ?? 0;
          await grantCredits(admin, row.user_id, credits);
          serverLog("stripe_webhook_subscription_renewal", { userId: row.user_id, planId: row.plan_id, credits });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription updated (upgrade, downgrade, pause, etc.)
      // -----------------------------------------------------------------------
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
        const session = await stripe.subscriptions.retrieve(sub.id);

        // Try to find new plan from metadata or price lookup
        const { data: existing } = await admin
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        if (existing) {
          await admin.from("user_subscriptions").update({
            status: session.status,
            current_period_end: new Date((session as any).current_period_end * 1000).toISOString(),
          }).eq("stripe_subscription_id", sub.id);

          serverLog("stripe_webhook_subscription_updated", { userId: existing.user_id, status: session.status });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription canceled / deleted
      // -----------------------------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin.from("user_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id);

        serverLog("stripe_webhook_subscription_canceled", { subId: sub.id });
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error.";
    serverLog("stripe_webhook_handler_error", { event: event.type, error: message });
    // Return 200 so Stripe does not retry — log the error for investigation
    return NextResponse.json({ received: true, error: message });
  }

  return NextResponse.json({ received: true });
}
