export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/**
 * Lightweight identity flag used by app onboarding UI.
 * Content creators are users with an active complimentary subscription
 * granted from partner links.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ userId: auth.user.id, isContentCreator: false });
  }

  const { data, error } = await admin
    .from("complimentary_subscriptions")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("source", "partner_link")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (error) {
    console.error("[me/content-creator] query error:", error.message);
    return NextResponse.json({ userId: auth.user.id, isContentCreator: false });
  }

  return NextResponse.json({
    userId: auth.user.id,
    isContentCreator: Array.isArray(data) && data.length > 0,
  });
}
