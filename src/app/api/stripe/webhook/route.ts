export const runtime = "nodejs";

/**
 * Stripe webhook, verifies signature then updates DB.
 * URL: https://app.youry.io/api/stripe/webhook
 * Events to enable in Stripe Dashboard:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_succeeded  (monthly credit renewal)
 */

import { NextResponse } from "next/server";
import { getSupabaseUrlOptional } from "@/lib/supabase/env";

/** GET /api/stripe/webhook, health check (no auth required). */
export async function GET() {
  const hasSecret = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const hasWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const hasSupabase =
    Boolean(getSupabaseUrlOptional()) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const ready = hasSecret && hasWebhookSecret && hasSupabase;
  return NextResponse.json({ ready, hasSecret, hasWebhookSecret, hasSupabase }, { status: ready ? 200 : 503 });
}

import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isSubscriptionPlanId, getPlanFromPriceId } from "@/lib/stripe/subscriptionPrices";
import { isCreditPackKey } from "@/lib/stripe/creditPackPrices";
import { serverLog } from "@/lib/serverLog";
import {
  resetSubscriptionCredits,
  addPackCredits as addPackCreditsLedger,
} from "@/lib/creditGrants";
import { brevoUpsertContact, brevoTrackEvent } from "@/lib/brevo";
import {
  stripeSubscriptionPeriodEndDate,
  stripeSubscriptionPeriodEndIso,
} from "@/lib/stripeSubscriptionPeriodEnd";
import { trackDubSaleServer } from "@/lib/dub/trackSaleServer";
import { STRIPE_ONE_DOLLAR_TRIAL_CREDIT_GRANT } from "@/lib/pricing";

function subscriptionPeriodEndFallbackDate(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

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

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

async function resolveUserEmailForBrevo(admin: SupabaseAdmin, userId: string): Promise<string | null> {
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const e = authUser?.user?.email?.trim().toLowerCase();
  return e && e.length > 0 ? e : null;
}

async function resolveEmailFromStripeCustomer(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const c = await stripe.customers.retrieve(customerId);
    if (c.deleted) return null;
    const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
    return email || null;
  } catch {
    return null;
  }
}

/**
 * Most users "cancel" via Stripe portal → cancel at period end. That fires
 * `customer.subscription.updated` (not `deleted`). `deleted` only fires when
 * the subscription object is removed (end of period or immediate cancel).
 */
async function brevoEmitCancelSubscription(opts: {
  email: string;
  planId: string;
  phase: "at_period_end_scheduled" | "subscription_ended";
  accessEndsAtIso?: string | null;
}): Promise<void> {
  if (opts.phase === "subscription_ended") {
    await brevoUpsertContact(opts.email, {
      PLAN: "",
      SUBSCRIPTION_STATUS: "canceled",
    });
  } else {
    await brevoUpsertContact(opts.email, {
      SUBSCRIPTION_STATUS: "cancel_at_period_end",
    });
  }
  await brevoTrackEvent(opts.email, "cancel_subscription", {
    eventProperties: {
      phase: opts.phase,
      plan: opts.planId || "unknown",
      ...(opts.accessEndsAtIso ? { access_ends_at: opts.accessEndsAtIso } : {}),
      ...(opts.phase === "subscription_ended" ? { ended_at: new Date().toISOString() } : {}),
    },
  });
  serverLog("brevo_cancel_subscription_ok", {
    phase: opts.phase,
    email_domain: opts.email.includes("@") ? opts.email.split("@")[1] : "?",
  });
}

export async function POST(req: Request) {
  const traceId = `stripe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    serverLog("dub_trace_stripe_event_start", { traceId, eventType: event.type, eventId: event.id });
    switch (event.type) {

      // -----------------------------------------------------------------------
      // Checkout completed, subscription start OR one-time credit pack
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

          const upgradeFromSubId = session.metadata?.upgrade_from_subscription_id;
          if (upgradeFromSubId) {
            try {
              await stripe.subscriptions.cancel(upgradeFromSubId);
              serverLog("stripe_webhook_upgrade_old_sub_canceled", { userId, oldSubId: upgradeFromSubId });
            } catch (cancelErr) {
              serverLog("stripe_webhook_upgrade_cancel_failed", {
                userId,
                oldSubId: upgradeFromSubId,
                error: cancelErr instanceof Error ? cancelErr.message : "unknown",
              });
            }
          }

          if (isSubscriptionPlanId(planId)) {
            const periodEnd =
              stripeSubscriptionPeriodEndDate(sub) ?? subscriptionPeriodEndFallbackDate();
            const periodEndIso = periodEnd.toISOString();
            await admin.from("user_subscriptions").upsert({
              user_id: userId,
              stripe_subscription_id: sub.id,
              stripe_customer_id: String(sub.customer),
              plan_id: planId,
              billing,
              status: sub.status,
              current_period_end: periodEndIso,
            }, { onConflict: "user_id" });

            const credits = SUBSCRIPTION_CREDITS[planId] ?? 0;
            await resetSubscriptionCredits(admin, userId, credits, periodEnd);
            serverLog("stripe_webhook_subscription_start", { userId, planId, credits });
          }
        }

        if (session.mode === "payment") {
          // $1 trial: grant 15 pack credits (expires in 3 months via add_pack_credits)
          if (session.metadata?.credit_trial === "1") {
            await addPackCreditsLedger(admin, userId, STRIPE_ONE_DOLLAR_TRIAL_CREDIT_GRANT);
            // Mark user as trial in app_metadata (service-role only, not user-editable)
            try {
              const started = new Date().toISOString();
              await admin.auth.admin.updateUserById(userId, {
                app_metadata: { trial_active: true, trial_started_at: started },
              });
            } catch { /* non-blocking */ }
            serverLog("stripe_webhook_trial_credits_granted", {
              userId,
              credits: STRIPE_ONE_DOLLAR_TRIAL_CREDIT_GRANT,
            });
          } else {
            const packKey = session.metadata?.credit_pack ?? "";
            if (isCreditPackKey(packKey)) {
              const credits = CREDIT_PACK_CREDITS[packKey] ?? 0;
              await addPackCreditsLedger(admin, userId, credits);
              serverLog("stripe_webhook_credits_granted", { userId, packKey, credits });
            }
          }
        }

        // --- Brevo: track payment event (non-blocking) ---
        try {
          const customerEmail =
            session.customer_details?.email ?? session.customer_email ?? null;
          let email = typeof customerEmail === "string" ? customerEmail.trim().toLowerCase() : "";
          if (!email) {
            const { data: authUser } = await admin.auth.admin.getUserById(userId);
            email = authUser?.user?.email?.trim().toLowerCase() ?? "";
          }
          if (email) {
            const amountTotal = (session.amount_total ?? 0) / 100;
            const currency = session.currency ?? "usd";
            const isSubscription = session.mode === "subscription";
            const planId = session.metadata?.subscription_plan ?? "";
            const packKey = session.metadata?.credit_pack ?? "";
            void brevoUpsertContact(email, {
              PAID: "true",
              LAST_PAYMENT_DATE: new Date().toISOString().slice(0, 10),
              ...(isSubscription && planId ? { PLAN: planId } : {}),
            });
            void brevoTrackEvent(email, "payment", {
              eventProperties: {
                type: isSubscription ? "subscription" : "credit_pack",
                plan: planId || packKey || "unknown",
                amount: amountTotal,
                currency,
              },
            });
          }
        } catch (brevoErr) {
          serverLog("stripe_webhook_brevo_error", {
            error: brevoErr instanceof Error ? brevoErr.message : "unknown",
          });
        }

        // --- Dub: track sale (non-blocking, server-side) ---
        try {
          const amountCents = session.amount_total ?? 0;
          const currency = session.currency ?? "usd";
          const isSubscription = session.mode === "subscription";
          const planId = session.metadata?.subscription_plan ?? "";
          const packKey = session.metadata?.credit_pack ?? "";
          const dubSkipSaleRaw = session.metadata?.dub_skip_sale?.trim().toLowerCase() ?? "";
          const skipDubPartnerSale =
            dubSkipSaleRaw === "1" || dubSkipSaleRaw === "true" || dubSkipSaleRaw === "yes";
          if (skipDubPartnerSale) {
            serverLog("dub_trace_sale_track_skipped", {
              traceId,
              eventId: event.id,
              sessionId: session.id,
              userId,
              reason: "metadata_dub_skip_sale",
            });
          } else if (amountCents > 0) {
            serverLog("dub_trace_sale_track_start", {
              traceId,
              eventId: event.id,
              sessionId: session.id,
              userId,
              amountCents,
              currency,
            });
            await trackDubSaleServer({
              customerExternalId: userId,
              amount: amountCents,
              invoiceId: session.id,
              paymentProcessor: "stripe",
              eventName: "Purchase",
              currency,
              metadata: {
                type: isSubscription ? "subscription" : "credit_pack",
                plan: planId || packKey || "unknown",
              },
            });
            serverLog("dub_trace_sale_track_done", {
              traceId,
              eventId: event.id,
              sessionId: session.id,
              userId,
            });
          } else {
            serverLog("dub_trace_sale_track_skipped", {
              traceId,
              eventId: event.id,
              sessionId: session.id,
              userId,
              reason: "amount_total_is_zero_or_missing",
            });
          }
        } catch (dubErr) {
          serverLog("stripe_webhook_dub_sale_error", {
            traceId,
            eventId: event.id,
            error: dubErr instanceof Error ? dubErr.message : "unknown",
          });
        }

        break;
      }

      // -----------------------------------------------------------------------
      // Monthly renewal, grant subscription credits
      // -----------------------------------------------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice & {
          /** Older API / webhook payloads exposed this at the top level. */
          subscription?: string | Stripe.Subscription | null;
        };
        if (invoice.billing_reason !== "subscription_cycle") break;

        const subRef =
          invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef && typeof subRef === "object" ? subRef.id : null;
        if (!subId) break;

        const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
        let liveSub: Stripe.Subscription | null = null;
        let renewalPeriodEnd: Date;
        try {
          liveSub = await stripe.subscriptions.retrieve(subId);
          renewalPeriodEnd =
            stripeSubscriptionPeriodEndDate(liveSub) ?? subscriptionPeriodEndFallbackDate();
        } catch {
          renewalPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        let detectedPlanId: string | null = null;
        let detectedBilling: "monthly" | "yearly" | null = null;
        if (liveSub) {
          for (const item of liveSub.items.data) {
            const match = getPlanFromPriceId(item.price.id);
            if (match) {
              detectedPlanId = match.planId;
              detectedBilling = match.billing;
              break;
            }
          }
        }

        const { data: row } = await admin
          .from("user_subscriptions")
          .select("user_id, plan_id, billing")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (row?.user_id) {
          const effectivePlanId = detectedPlanId || row.plan_id;
          const effectiveBilling = detectedBilling || row.billing;

          await admin.from("user_subscriptions").update({
            plan_id: effectivePlanId,
            billing: effectiveBilling,
            status: liveSub?.status ?? "active",
            current_period_end: renewalPeriodEnd.toISOString(),
          }).eq("stripe_subscription_id", subId);

          const credits = SUBSCRIPTION_CREDITS[effectivePlanId] ?? 0;
          await resetSubscriptionCredits(admin, row.user_id, credits, renewalPeriodEnd);
          serverLog("stripe_webhook_subscription_renewal", { userId: row.user_id, planId: effectivePlanId, credits });
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

        const previousAttributes = (event.data as Stripe.Event.Data & {
          previous_attributes?: Partial<Stripe.Subscription> | null;
        }).previous_attributes;

        /** User canceled renewal in portal, subscription stays active until period end. */
        const cancelJustScheduled =
          sub.cancel_at_period_end === true &&
          previousAttributes != null &&
          previousAttributes.cancel_at_period_end === false;

        const { data: existing } = await admin
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        if (existing) {
          const updatedEndIso = stripeSubscriptionPeriodEndIso(session);
          await admin.from("user_subscriptions").update({
            status: session.status,
            ...(updatedEndIso ? { current_period_end: updatedEndIso } : {}),
          }).eq("stripe_subscription_id", sub.id);

          serverLog("stripe_webhook_subscription_updated", { userId: existing.user_id, status: session.status });
        }

        if (cancelJustScheduled) {
          try {
            let email: string | null = null;
            let planId = existing?.plan_id ?? "unknown";
            if (existing?.user_id) {
              email = await resolveUserEmailForBrevo(admin, existing.user_id);
            }
            if (!email && typeof sub.customer === "string") {
              email = await resolveEmailFromStripeCustomer(stripe, sub.customer);
              const firstItem = sub.items?.data?.[0];
              const match = firstItem?.price?.id ? getPlanFromPriceId(firstItem.price.id) : null;
              if (match) planId = match.planId;
            }
            if (email) {
              const accessEnds = stripeSubscriptionPeriodEndIso(sub) ?? null;
              await brevoEmitCancelSubscription({
                email,
                planId: typeof planId === "string" ? planId : "unknown",
                phase: "at_period_end_scheduled",
                accessEndsAtIso: accessEnds,
              });
            } else {
              serverLog("brevo_cancel_subscription_skipped_no_email", { subId: sub.id });
            }
          } catch (brevoErr) {
            serverLog("stripe_webhook_brevo_cancel_scheduled_error", {
              error: brevoErr instanceof Error ? brevoErr.message : "unknown",
            });
          }
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription canceled / deleted
      // -----------------------------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

        const { data: canceledRow } = await admin
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        await admin.from("user_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id);

        serverLog("stripe_webhook_subscription_canceled", { subId: sub.id });

        try {
          let email: string | null = null;
          let planId = canceledRow?.plan_id ?? "unknown";
          if (canceledRow?.user_id) {
            email = await resolveUserEmailForBrevo(admin, canceledRow.user_id);
          }
          if (!email && typeof sub.customer === "string") {
            email = await resolveEmailFromStripeCustomer(stripe, sub.customer);
            const firstItem = sub.items?.data?.[0];
            const match = firstItem?.price?.id ? getPlanFromPriceId(firstItem.price.id) : null;
            if (match) planId = match.planId;
          }
          if (email) {
            await brevoEmitCancelSubscription({
              email,
              planId: typeof planId === "string" ? planId : "unknown",
              phase: "subscription_ended",
            });
          } else {
            serverLog("brevo_cancel_subscription_deleted_skipped_no_email", { subId: sub.id });
          }
        } catch (brevoErr) {
          serverLog("stripe_webhook_brevo_cancel_deleted_error", {
            error: brevoErr instanceof Error ? brevoErr.message : "unknown",
          });
        }

        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error.";
    serverLog("stripe_webhook_handler_error", { event: event.type, error: message });
    // Return 200 so Stripe does not retry, log the error for investigation
    return NextResponse.json({ received: true, error: message });
  }

  return NextResponse.json({ received: true });
}
