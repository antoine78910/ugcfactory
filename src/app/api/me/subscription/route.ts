import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";

export type MeSubscriptionResponse = {
  planId: AccountPlanId;
  billing: "monthly" | "yearly" | null;
  userId: string;
};

/**
 * Active subscription billing from DB (Stripe webhook). Used on /subscription so the UI can
 * offer "Switch to yearly" on the current tier without guessing from localStorage.
 * Uses the service-role client to bypass RLS — safe because the user is authenticated
 * and we only return their own row.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const free: MeSubscriptionResponse = { planId: "free", billing: null, userId: auth.user.id };

  try {
    const admin = createSupabaseServiceClient();
    if (!admin) {
      console.error("[me/subscription] service client unavailable");
      return NextResponse.json(free satisfies MeSubscriptionResponse);
    }

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, billing, status")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("[me/subscription] DB error:", error.message);
      return NextResponse.json(free satisfies MeSubscriptionResponse);
    }

    if (!data) {
      return NextResponse.json(free satisfies MeSubscriptionResponse);
    }

    if (data.status !== "active" && data.status !== "trialing") {
      console.warn("[me/subscription] non-active status for user", auth.user.id, "→", data.status);
      return NextResponse.json(free satisfies MeSubscriptionResponse);
    }

    const planId = parseAccountPlan(data.plan_id);
    const raw = data.billing;
    const billing =
      raw === "yearly" ? "yearly" : raw === "monthly" ? "monthly" : null;

    return NextResponse.json({
      planId,
      billing: planId === "free" ? null : billing,
      userId: auth.user.id,
    } satisfies MeSubscriptionResponse);
  } catch (err) {
    console.error("[me/subscription] unexpected error:", err);
    return NextResponse.json(free satisfies MeSubscriptionResponse);
  }
}
