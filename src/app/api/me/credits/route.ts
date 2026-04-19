export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { isSubscriptionUnlimitedEmail } from "@/lib/allowedUsers";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";

export type MeCreditsResponse = {
  balance: number;
  subscriptionCredits: number;
  packCredits: number;
};

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  if (isSubscriptionUnlimitedEmail(email)) {
    return NextResponse.json({
      balance: 999_999,
      subscriptionCredits: 999_999,
      packCredits: 0,
    } satisfies MeCreditsResponse);
  }

  if (!admin) {
    return NextResponse.json({ balance: 0, subscriptionCredits: 0, packCredits: 0 } satisfies MeCreditsResponse);
  }

  const result = await getUserCreditBalance(admin, auth.user.id);
  return NextResponse.json(result satisfies MeCreditsResponse);
}
