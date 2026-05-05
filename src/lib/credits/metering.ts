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
