/**
 * Server-side helpers for the credit-grants ledger.
 *
 * All functions require the admin (service-role) Supabase client.
 * They call the RPCs defined in supabase/credit_grants.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  displayCreditsToLedgerTicks,
  ledgerTicksToDisplayCredits,
} from "@/lib/creditLedgerTicks";

export type CreditGrantsBalance = {
  balance: number;
  subscriptionCredits: number;
  packCredits: number;
};

/** Effective balance: sum of non-expired grants. */
export async function getUserCreditBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditGrantsBalance> {
  const { data, error } = await admin.rpc("get_user_credit_balance", {
    p_user_id: userId,
  });

  const balanceTicks = typeof data === "number" ? data : 0;
  if (error) console.error("[creditGrants] get_user_credit_balance error:", error);

  const { data: rows } = await admin
    .from("user_credit_grants")
    .select("source, remaining")
    .eq("user_id", userId)
    .gt("remaining", 0)
    .gt("expires_at", new Date().toISOString());

  let subscriptionCredits = 0;
  let packCredits = 0;
  for (const r of rows ?? []) {
    const rem = ledgerTicksToDisplayCredits(r.remaining);
    if (r.source === "subscription") subscriptionCredits += rem;
    else packCredits += rem;
  }

  return {
    balance: ledgerTicksToDisplayCredits(balanceTicks),
    subscriptionCredits,
    packCredits,
  };
}

/** FIFO spend — `amount` is display credits (e.g. 0.5); returns display credits actually spent. */
export async function spendUserCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<number> {
  const ticks = displayCreditsToLedgerTicks(amount);
  if (ticks <= 0) return 0;
  const { data, error } = await admin.rpc("spend_user_credits_fifo", {
    p_user_id: userId,
    p_amount: ticks,
  });
  if (error) console.error("[creditGrants] spend_user_credits_fifo error:", error);
  const spentTicks = typeof data === "number" ? data : 0;
  return ledgerTicksToDisplayCredits(spentTicks);
}

/** Refund credits (e.g. failed generation). */
export async function refundUserCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<void> {
  const ticks = displayCreditsToLedgerTicks(amount);
  if (ticks <= 0) return;
  const { error } = await admin.rpc("refund_user_credits", {
    p_user_id: userId,
    p_amount: ticks,
  });
  if (error) console.error("[creditGrants] refund_user_credits error:", error);
}

/**
 * Reset subscription credits for a new billing period.
 * Zeroes out all previous subscription grants and creates a fresh one.
 */
export async function resetSubscriptionCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  expiresAt: Date,
): Promise<void> {
  const ticks = displayCreditsToLedgerTicks(amount);
  if (ticks <= 0) return;
  const { error } = await admin.rpc("reset_subscription_credits", {
    p_user_id: userId,
    p_amount: ticks,
    p_expires_at: expiresAt.toISOString(),
  });
  if (error) console.error("[creditGrants] reset_subscription_credits error:", error);
}

/** Add one-time pack credits (expire in 3 months). */
export async function addPackCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<void> {
  const ticks = displayCreditsToLedgerTicks(amount);
  if (ticks <= 0) return;
  const { error } = await admin.rpc("add_pack_credits", {
    p_user_id: userId,
    p_amount: ticks,
  });
  if (error) console.error("[creditGrants] add_pack_credits error:", error);
}
