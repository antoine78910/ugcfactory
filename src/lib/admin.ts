import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { NextResponse } from "next/server";
import { isPrimaryAdminEmail } from "@/lib/adminEmails";
import { sessionUserEmail } from "@/lib/sessionUserEmail";

export async function requireAdmin() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth;

  const email = sessionUserEmail(auth.user)?.toLowerCase().trim() ?? "";
  if (!isPrimaryAdminEmail(email)) {
    return {
      ...auth,
      user: null as never,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth;
}
