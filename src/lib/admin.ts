import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { NextResponse } from "next/server";

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export async function requireAdmin() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth;

  const email = auth.user.email?.toLowerCase().trim() ?? "";
  if (!ADMIN_EMAILS.has(email)) {
    return {
      ...auth,
      user: null as never,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth;
}
