import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  parseAccountPlan,
  planRank,
  type AccountPlanId,
} from "@/lib/subscriptionModelAccess";
import { getActiveComplimentaryPlan } from "@/lib/complimentarySubscription";

/**
 * Fetch the user's active subscription plan from the DB (server-side only).
 * Uses the service-role client to bypass RLS, safe because this is server-only code.
 *
 * Merges two sources:
 *   • `user_subscriptions` — Stripe-backed plans, kept in lock-step with Stripe.
 *   • `complimentary_subscriptions` — admin-granted plans (no Stripe customer).
 *
 * Returns the highest-ranked active tier, or "free" when neither source
 * yields an active plan.
 */
export async function getUserPlan(userId: string): Promise<AccountPlanId> {
  try {
    const admin = createSupabaseServiceClient();
    if (!admin) return "free";

    let stripePlan: AccountPlanId = "free";
    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[getUserPlan] DB error:", error.message);
    } else if (data && (data.status === "active" || data.status === "trialing")) {
      stripePlan = parseAccountPlan(data.plan_id);
    }

    const comp = await getActiveComplimentaryPlan(admin, userId);
    if (comp && planRank(comp.planId) > planRank(stripePlan)) {
      return comp.planId;
    }
    return stripePlan;
  } catch (err) {
    console.error("[getUserPlan] unexpected error:", err);
  }
  return "free";
}
