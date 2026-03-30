import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";

export type MeSubscriptionResponse = {
  planId: AccountPlanId;
  billing: "monthly" | "yearly" | null;
  userId: string;
};

/**
 * Active subscription billing from DB (Stripe webhook). Used on /subscription so the UI can
 * offer "Switch to yearly" on the current tier without guessing from localStorage.
 */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  try {
    const { data, error } = await auth.supabase
      .from("user_subscriptions")
      .select("plan_id, billing, status")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ planId: "free", billing: null, userId: auth.user.id } satisfies MeSubscriptionResponse);
    }

    if (data.status !== "active" && data.status !== "trialing") {
      return NextResponse.json({ planId: "free", billing: null, userId: auth.user.id } satisfies MeSubscriptionResponse);
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
  } catch {
    return NextResponse.json({ planId: "free", billing: null, userId: auth.user.id } satisfies MeSubscriptionResponse);
  }
}
