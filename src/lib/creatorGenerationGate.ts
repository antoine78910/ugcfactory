import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { CREATOR_TEMPLATES_ONLY } from "@/lib/creatorFormatsNotice";
import { isRestrictedCreatorAccount } from "@/lib/influencerAccounts";

export { CREATOR_TEMPLATES_ONLY };

/** Block paid generation for Ecom Efficiency creators. They only view static templates. */
export function creatorGenerationBlocked(user: User | null | undefined): NextResponse | null {
  if (!isRestrictedCreatorAccount(user)) return null;
  return NextResponse.json(
    {
      error: CREATOR_TEMPLATES_ONLY,
      code: CREATOR_TEMPLATES_ONLY,
      message: "Creator accounts can use Link to Ad and static workflow templates only.",
    },
    { status: 403 },
  );
}
