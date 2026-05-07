import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { isSubscriptionUnlimitedEmail } from "@/lib/allowedUsers";

/**
 * Single source of truth: returns true when the request must spend platform credits.
 * Replaces the previous `planId === "free"` rule. Now: every user pays UNLESS
 *   • they bring their own provider API key (`usesPersonalApi`), or
 *   • they are on the staff/internal "unlimited" allowlist.
 */
export function shouldChargePlatformCredits(args: {
  usesPersonalApi: boolean;
  email: string | null | undefined;
}): boolean {
  if (args.usesPersonalApi) return false;
  if (isSubscriptionUnlimitedEmail(args.email ?? "")) return false;
  return true;
}

/**
 * Pre-flight balance gate. Returns a 402 NextResponse when the user does not
 * have enough credits to cover `costDisplayCredits`; returns `null` otherwise.
 * Caller should `if (gate) return gate;` before any external provider call.
 *
 * Every plan with a finite ledger balance is gated:
 *   - free / trial: consume free allowance
 *   - paid Stripe subscribers: consume monthly subscription grant (refilled by webhook)
 *   - complimentary plans (admin gifts to creators): consume pack grant from redeem
 *
 * The historical "free-only" gate let creators on comp plans generate without ever
 * decrementing their ledger, so the admin dashboard always showed the same balance.
 * Now we always check the ledger; the unlimited allowlist still bypasses charging
 * upstream via {@link shouldChargePlatformCredits}, so unlimited accounts never
 * even reach this function.
 */
export async function assertSufficientCreditsResponse(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  costDisplayCredits: number;
}): Promise<NextResponse | null> {
  if (args.costDisplayCredits <= 0) return null;
  const { balance } = await getUserCreditBalance(args.admin, args.userId);
  if (balance >= args.costDisplayCredits) return null;
  return NextResponse.json(
    {
      error: "INSUFFICIENT_CREDITS",
      need: args.costDisplayCredits,
      have: balance,
      planId: args.planId,
    },
    { status: 402 },
  );
}
