export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isAllowedUser } from "@/lib/allowedUsers";

/**
 * POST /api/credits/redeem-tokens
 * Admin-only: create a new redeem token.
 * Body: { amount: number, label?: string, maxUses?: number, expiresInDays?: number }
 * Returns: { token: { secret, amount, maxUses, expiresAt, url } }
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  if (!isAllowedUser(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    amount?: number;
    label?: string;
    maxUses?: number;
    expiresInDays?: number;
  };

  const amount = Math.round(Number(body.amount) || 0);
  if (amount <= 0 || amount > 10_000) {
    return NextResponse.json({ error: "amount must be 1–10 000" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : null;
  const maxUses =
    body.maxUses != null ? Math.max(1, Math.round(Number(body.maxUses) || 1)) : null;

  let expiresAt: string | null = null;
  if (body.expiresInDays != null) {
    const days = Math.max(1, Math.round(Number(body.expiresInDays) || 30));
    expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("credit_redeem_tokens")
    .insert({
      amount,
      label,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select("secret, amount, max_uses, expires_at")
    .single();

  if (error || !data) {
    console.error("[redeem-tokens] insert error:", error);
    return NextResponse.json({ error: "Could not create token" }, { status: 500 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "https://app.youry.io";

  return NextResponse.json({
    token: {
      secret: data.secret,
      amount: data.amount,
      maxUses: data.max_uses,
      expiresAt: data.expires_at,
      url: `${origin}/redeem?token=${data.secret}`,
    },
  });
}

/**
 * GET /api/credits/redeem-tokens
 * Admin-only: list all tokens with usage stats.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  if (!isAllowedUser(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("credit_redeem_tokens")
    .select("id, secret, label, amount, max_uses, used_count, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[redeem-tokens] list error:", error);
    return NextResponse.json({ error: "Could not list tokens" }, { status: 500 });
  }

  return NextResponse.json({ tokens: data });
}
