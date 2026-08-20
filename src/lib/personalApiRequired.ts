import { NextResponse } from "next/server";

import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import { PERSONAL_API_KEY_REQUIRED } from "@/lib/personalApiRequiredCode";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

export { PERSONAL_API_KEY_REQUIRED } from "@/lib/personalApiRequiredCode";

/**
 * Free-plan users must bring their own Kie API key so usage is billed on
 * their kie.ai account, not the platform key. Paid plans may use platform credits.
 */
export async function assertPersonalApiForFreePlan(opts: {
  userId: string;
  personalApiKey?: unknown;
}): Promise<NextResponse | null> {
  if (hasPersonalApiKey(opts.personalApiKey)) return null;

  const plan = await getUserPlan(opts.userId);
  if (plan !== "free") return null;

  return NextResponse.json(
    {
      error: PERSONAL_API_KEY_REQUIRED,
      code: PERSONAL_API_KEY_REQUIRED,
      message:
        "Add your Kie API key to generate on the free plan. Usage is billed on your kie.ai account, not platform credits.",
    },
    { status: 403 },
  );
}
