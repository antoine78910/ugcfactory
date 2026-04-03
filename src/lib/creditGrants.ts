/**
 * Server-side helpers for the credit-grants ledger.
 *
 * All functions require the admin (service-role) Supabase client.
 * They call the RPCs defined in supabase/credit_grants.sql.
 *
 * FALLBACK: When the new `user_credit_grants` table/RPCs don't exist yet in the
 * database, every function transparently falls back to the legacy
 * `user_credits.balance` table + `increment_user_credits` RPC so that credits
 * are never silently lost.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreditGrantsBalance = {
  balance: number;
  subscriptionCredits: number;
  packCredits: number;
};

// ---------------------------------------------------------------------------
// Helpers — legacy fallback
// ---------------------------------------------------------------------------

async function legacyGetBalance(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[creditGrants] legacyGetBalance error:", error);
    return 0;
  }
  return data?.balance ?? 0;
}

async function legacyIncrement(admin: SupabaseClient, userId: string, amount: number): Promise<void> {
  const { error } = await admin.rpc("increment_user_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("[creditGrants] legacyIncrement rpc error, trying direct upsert:", error);
    const { error: upsertErr } = await admin
      .from("user_credits")
      .upsert(
        { user_id: userId, balance: Math.max(0, amount) },
        { onConflict: "user_id" },
      );
    if (upsertErr) console.error("[creditGrants] legacyIncrement upsert error:", upsertErr);
  }
}

async function legacySetBalance(admin: SupabaseClient, userId: string, balance: number): Promise<void> {
  const { error } = await admin
    .from("user_credits")
    .upsert(
      { user_id: userId, balance: Math.max(0, balance) },
      { onConflict: "user_id" },
    );
  if (error) console.error("[creditGrants] legacySetBalance error:", error);
}

async function legacyDecrement(admin: SupabaseClient, userId: string, amount: number): Promise<number> {
  const current = await legacyGetBalance(admin, userId);
  const deduct = Math.min(current, amount);
  if (deduct <= 0) return 0;
  await legacySetBalance(admin, userId, current - deduct);
  return deduct;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Effective balance: sum of non-expired grants, with legacy fallback. */
export async function getUserCreditBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditGrantsBalance> {
  const { data, error } = await admin.rpc("get_user_credit_balance", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[creditGrants] get_user_credit_balance error (falling back to legacy):", error);
    const balance = await legacyGetBalance(admin, userId);
    return { balance, subscriptionCredits: 0, packCredits: balance };
  }

  const balance = typeof data === "number" ? data : 0;

  const { data: rows } = await admin
    .from("user_credit_grants")
    .select("source, remaining")
    .eq("user_id", userId)
    .gt("remaining", 0)
    .gt("expires_at", new Date().toISOString());

  let subscriptionCredits = 0;
  let packCredits = 0;
  for (const r of rows ?? []) {
    if (r.source === "subscription") subscriptionCredits += r.remaining;
    else packCredits += r.remaining;
  }

  // If the new ledger returned 0 but legacy has credits, include those too.
  if (balance === 0) {
    const legacyBal = await legacyGetBalance(admin, userId);
    if (legacyBal > 0) {
      return { balance: legacyBal, subscriptionCredits: 0, packCredits: legacyBal };
    }
  }

  return { balance, subscriptionCredits, packCredits };
}

/** FIFO spend — returns credits actually spent. Falls back to legacy. */
export async function spendUserCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<number> {
  const amt = Math.max(0, Math.floor(amount));
  if (amt === 0) return 0;

  const { data, error } = await admin.rpc("spend_user_credits_fifo", {
    p_user_id: userId,
    p_amount: amt,
  });

  if (error) {
    console.error("[creditGrants] spend_user_credits_fifo error (falling back to legacy):", error);
    return legacyDecrement(admin, userId, amt);
  }

  const spent = typeof data === "number" ? data : 0;

  // If the new system spent 0 but we expected more, try legacy.
  if (spent === 0 && amt > 0) {
    const legacyBal = await legacyGetBalance(admin, userId);
    if (legacyBal > 0) {
      return legacyDecrement(admin, userId, amt);
    }
  }

  return spent;
}

/** Refund credits (e.g. failed generation). Falls back to legacy. */
export async function refundUserCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<void> {
  const amt = Math.max(0, Math.floor(amount));
  if (amt === 0) return;

  const { error } = await admin.rpc("refund_user_credits", {
    p_user_id: userId,
    p_amount: amt,
  });

  if (error) {
    console.error("[creditGrants] refund_user_credits error (falling back to legacy):", error);
    await legacyIncrement(admin, userId, amt);
  }
}

/**
 * Reset subscription credits for a new billing period.
 * Zeroes out all previous subscription grants and creates a fresh one.
 * Falls back to overwriting legacy balance.
 */
export async function resetSubscriptionCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  expiresAt: Date,
): Promise<void> {
  const { error } = await admin.rpc("reset_subscription_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[creditGrants] reset_subscription_credits error (falling back to legacy):", error);
    await legacySetBalance(admin, userId, amount);
  }
}

/** Add one-time pack credits (expire in 3 months). Falls back to legacy increment. */
export async function addPackCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
): Promise<void> {
  const { error } = await admin.rpc("add_pack_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("[creditGrants] add_pack_credits error (falling back to legacy):", error);
    await legacyIncrement(admin, userId, amount);
  }
}
