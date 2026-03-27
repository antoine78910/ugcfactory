import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { NextResponse } from "next/server";

const PRIMARY_ADMIN_EMAIL = "anto.delbos@gmail.com";

export async function requireAdmin() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth;

  const email = auth.user.email?.toLowerCase().trim() ?? "";
  if (email !== PRIMARY_ADMIN_EMAIL) {
    return {
      ...auth,
      user: null as never,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth;
}
