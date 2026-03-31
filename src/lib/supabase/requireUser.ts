import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedUser } from "@/lib/allowedUsers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type Ok = { supabase: SupabaseClient; user: User; response: null };
type Fail = { supabase: SupabaseClient; user: null; response: NextResponse };

/**
 * Requires a valid Supabase session AND that the account email is in the
 * server-side allowlist (allowedUsers.ts).
 *
 * Returns 401 for unauthenticated requests, 403 for authenticated but
 * non-allowlisted accounts. This is the single enforcement point for all
 * protected API routes — the allowlist cannot be bypassed via env vars or
 * client-supplied data.
 */
export async function requireSupabaseUser(): Promise<Ok | Fail> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Allowlist enforcement — only permitted accounts may use the API.
  if (!isAllowedUser(user.email)) {
    return {
      supabase,
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { supabase, user, response: null };
}

