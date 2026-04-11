export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { addPackCredits, getUserCreditBalance } from "@/lib/creditGrants";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";

/**
 * POST /api/credits/redeem
 * Authenticated user redeems a token secret.
 * Body: { token: string }
 *
 * Security:
 *  - User must be authenticated (Supabase session).
 *  - Token must exist, not be expired, not exceed max_uses.
 *  - Same user cannot redeem the same token twice (DB unique constraint).
 *  - Credits are granted via the existing add_pack_credits RPC (3-month expiry).
 *  - used_count is bumped atomically with a conditional UPDATE (race-safe).
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const body = (await req.json()) as { token?: string };
  const secret = typeof body.token === "string" ? body.token.trim() : "";
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: token, error: fetchErr } = await admin
    .from("credit_redeem_tokens")
    .select("id, amount, max_uses, used_count, expires_at")
    .eq("secret", secret)
    .single();

  if (fetchErr || !token) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 410 });
  }

  if (token.max_uses != null && token.used_count >= token.max_uses) {
    return NextResponse.json({ error: "Token has been fully redeemed" }, { status: 410 });
  }

  const { data: existing } = await admin
    .from("credit_redeem_logs")
    .select("id")
    .eq("token_id", token.id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You have already redeemed this token" }, { status: 409 });
  }

  // Atomic bump: only succeeds if used_count hasn't raced past max_uses.
  let bumpQuery = admin
    .from("credit_redeem_tokens")
    .update({ used_count: token.used_count + 1 }, { count: "exact" })
    .eq("id", token.id)
    .eq("used_count", token.used_count); // optimistic lock

  if (token.max_uses != null) {
    bumpQuery = bumpQuery.lt("used_count", token.max_uses);
  }

  const { error: bumpErr, count } = await bumpQuery;
  if (bumpErr) {
    console.error("[redeem] bump used_count error:", bumpErr);
    return NextResponse.json({ error: "Could not redeem token" }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json({ error: "Token has been fully redeemed" }, { status: 410 });
  }

  const { error: logErr } = await admin.from("credit_redeem_logs").insert({
    token_id: token.id,
    user_id: auth.user.id,
    amount: displayCreditsToLedgerTicks(token.amount),
  });

  if (logErr) {
    console.error("[redeem] log insert error:", logErr);
    // Non-fatal: credits still granted below.
  }

  await addPackCredits(admin, auth.user.id, token.amount);

  const { balance } = await getUserCreditBalance(admin, auth.user.id);

  return NextResponse.json({
    success: true,
    credited: token.amount,
    balance,
  });
}
