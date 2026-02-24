import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type Ok = { supabase: SupabaseClient; user: User; response: null };
type Fail = { supabase: SupabaseClient; user: null; response: NextResponse };

/**
 * Exige une session Supabase valide. Chaque user a sa propre session (cookie/JWT).
 * Toutes les APIs qui touchent runs/cache/uploads doivent l’utiliser pour ne pas mélanger les données.
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

