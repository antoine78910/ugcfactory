export const runtime = "nodejs";

/**
 * Admin endpoint: resync a user's subscription status from Stripe.
 *
 * POST /api/admin/subscriptions/resync
 * Body (JSON), one of:
 *   { "user_email": "foo@bar.com" }
 *   { "stripe_subscription_id": "sub_xxx" }
 *
 * GET /api/admin/subscriptions/resync?email=foo@bar.com
 *  , read-only: returns DB row + live Stripe status without writing anything
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Pass ?email=..." }, { status: 400 });

  // Resolve user_id from email
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = usersData?.users?.find((u) => u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: row } = await admin
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return NextResponse.json({ db: null, stripe: null, userId: user.id });

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });
  let stripeData: Stripe.Subscription | null = null;
  try {
    stripeData = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch {
    // subscription may have been deleted in Stripe
  }

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    db: row,
    stripe: stripeData
      ? {
          id: stripeData.id,
          status: stripeData.status,
          current_period_end: new Date((stripeData as any).current_period_end * 1000).toISOString(),
          cancel_at_period_end: (stripeData as any).cancel_at_period_end,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const userEmail: string | undefined = body.user_email?.trim().toLowerCase();
  const stripeSubId: string | undefined = body.stripe_subscription_id?.trim();

  if (!userEmail && !stripeSubId) {
    return NextResponse.json({ error: "Provide user_email or stripe_subscription_id" }, { status: 400 });
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-02-25.clover" });

  // --- Resolve the DB row ---
  let dbRow: Record<string, unknown> | null = null;

  if (stripeSubId) {
    const { data } = await admin
      .from("user_subscriptions")
      .select("*")
      .eq("stripe_subscription_id", stripeSubId)
      .maybeSingle();
    dbRow = data as Record<string, unknown> | null;
  } else if (userEmail) {
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = usersData?.users?.find((u) => u.email?.toLowerCase() === userEmail);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data } = await admin
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    dbRow = data as Record<string, unknown> | null;
  }

  if (!dbRow) {
    return NextResponse.json({ error: "No subscription row found in DB for this user/subscription." }, { status: 404 });
  }

  // --- Fetch live status from Stripe ---
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(dbRow.stripe_subscription_id as string);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe fetch failed";
    return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 502 });
  }

  const newStatus = sub.status;
  const newPeriodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
  const oldStatus = dbRow.status as string;

  // Update the DB row with the live Stripe values
  const { error: updateError } = await admin
    .from("user_subscriptions")
    .update({
      status: newStatus,
      current_period_end: newPeriodEnd,
      stripe_customer_id: String(sub.customer),
    })
    .eq("stripe_subscription_id", sub.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    userId: dbRow.user_id,
    stripe_subscription_id: sub.id,
    before: { status: oldStatus },
    after: {
      status: newStatus,
      current_period_end: newPeriodEnd,
      cancel_at_period_end: (sub as any).cancel_at_period_end,
    },
  });
}
