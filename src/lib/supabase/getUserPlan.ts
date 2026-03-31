import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";

/**
 * Fetch the user's active subscription plan from the DB (server-side only).
 * Uses the service-role client to bypass RLS — safe because this is server-only code.
 * Returns "free" if no active subscription is found.
 */
export async function getUserPlan(userId: string): Promise<AccountPlanId> {
  try {
    const admin = createSupabaseServiceClient();
    if (!admin) return "free";

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[getUserPlan] DB error:", error.message);
      return "free";
    }

    if (data && (data.status === "active" || data.status === "trialing")) {
      return parseAccountPlan(data.plan_id);
    }
  } catch (err) {
    console.error("[getUserPlan] unexpected error:", err);
  }
  return "free";
}
