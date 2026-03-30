import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type Ok = { supabase: SupabaseClient; user: User; response: null };
type Fail = { supabase: SupabaseClient; user: null; response: NextResponse };

/**
 * Requires a valid Supabase session. Each user has their own session (cookie/JWT).
 * APIs that touch runs/cache/uploads must use it so data is not mixed between users.
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

  return { supabase, user, response: null };
}

