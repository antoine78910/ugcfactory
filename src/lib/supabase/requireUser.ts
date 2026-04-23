import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type Ok = { supabase: SupabaseClient; user: User; response: null };
type Fail = { supabase: SupabaseClient; user: null; response: NextResponse };

/**
 * Requires a valid Supabase session.
 * Returns 401 for unauthenticated requests.
 * Access control beyond authentication (credits, subscription tier) is
 * enforced at the route level, not here.
 */
export async function requireSupabaseUser(): Promise<Ok | Fail> {
  const supabase = await createSupabaseServerClient();
  const readUser = async () => supabase.auth.getUser();
  let authRes = await readUser();
  const transientMsg = (authRes.error?.message ?? "").toLowerCase();
  if (!authRes.data?.user && authRes.error && (transientMsg.includes("fetch failed") || transientMsg.includes("timeout"))) {
    await new Promise((r) => setTimeout(r, 250));
    authRes = await readUser();
  }
  const {
    data: { user },
    error,
  } = authRes;

  if (error || !user) {
    const message = (error?.message ?? "").toLowerCase();
    const isTransientNetwork = message.includes("fetch failed") || message.includes("timeout");
    return {
      supabase,
      user: null,
      response: isTransientNetwork
        ? NextResponse.json({ error: "Supabase temporarily unreachable" }, { status: 503 })
        : NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { supabase, user, response: null };
}

