export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { spendUserCredits, getUserCreditBalance } from "@/lib/creditGrants";
import { isAllowedUser } from "@/lib/allowedUsers";
import { sessionUserEmail } from "@/lib/sessionUserEmail";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  if (isAllowedUser(sessionUserEmail(auth.user))) {
    return NextResponse.json({ spent: 0, balance: 999_999 });
  }

  const body = (await req.json()) as { amount?: number };
  const display = Math.max(0, Number(body.amount) || 0);
  if (displayCreditsToLedgerTicks(display) <= 0) {
    return NextResponse.json({ spent: 0, balance: 0 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const spent = await spendUserCredits(admin, auth.user.id, display);
  const { balance } = await getUserCreditBalance(admin, auth.user.id);
  return NextResponse.json({ spent, balance });
}
