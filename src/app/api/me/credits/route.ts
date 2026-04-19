export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { getUserCreditBalance } from "@/lib/creditGrants";
import { isAllowedUser } from "@/lib/allowedUsers";
import { sessionUserEmail } from "@/lib/sessionUserEmail";

export type MeCreditsResponse = {
  balance: number;
  subscriptionCredits: number;
  packCredits: number;
};

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  if (isAllowedUser(sessionUserEmail(auth.user))) {
    return NextResponse.json({
      balance: 999_999,
      subscriptionCredits: 999_999,
      packCredits: 0,
    } satisfies MeCreditsResponse);
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ balance: 0, subscriptionCredits: 0, packCredits: 0 } satisfies MeCreditsResponse);
  }

  const result = await getUserCreditBalance(admin, auth.user.id);
  return NextResponse.json(result satisfies MeCreditsResponse);
}
