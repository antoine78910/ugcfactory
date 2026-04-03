export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { refundUserCredits, getUserCreditBalance } from "@/lib/creditGrants";
import { isAllowedUser } from "@/lib/allowedUsers";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  if (isAllowedUser(auth.user.email)) {
    return NextResponse.json({ balance: 999_999 });
  }

  const body = (await req.json()) as { amount?: number };
  const display = Math.max(0, Number(body.amount) || 0);
  if (displayCreditsToLedgerTicks(display) <= 0) {
    return NextResponse.json({ balance: 0 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  await refundUserCredits(admin, auth.user.id, display);
  const { balance } = await getUserCreditBalance(admin, auth.user.id);
  return NextResponse.json({ balance });
}
