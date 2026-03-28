import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAccountPlan, type AccountPlanId } from "@/lib/subscriptionModelAccess";

/**
 * Fetch the user's active subscription plan from the DB (server-side only).
 * Returns "free" if no active subscription is found.
 */
export async function getUserPlan(supabase: SupabaseClient, userId: string): Promise<AccountPlanId> {
  try {
    const { data } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (data && (data.status === "active" || data.status === "trialing")) {
      return parseAccountPlan(data.plan_id);
    }
  } catch {
    // Table may not exist yet during migration — fall back to client-provided value
  }
  return "free";
}
