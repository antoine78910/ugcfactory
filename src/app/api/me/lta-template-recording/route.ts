export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);
  const enabled = await isLtaTemplateRecordingUser(email);

  return NextResponse.json({ enabled });
}
