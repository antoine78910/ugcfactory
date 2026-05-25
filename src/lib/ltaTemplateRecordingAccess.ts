import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import {
  isDefaultTemplateRecordingEmail,
  normalizeTemplateRecordingEmail,
} from "@/lib/ltaTemplateRecording";
import { isMissingLtaTemplateTableError } from "@/lib/ltaTemplateRecordingDb";

/** Best-effort email for allowlists (session → Auth admin → profiles). */
export async function resolveAllowlistEmail(
  user: User,
  admin: SupabaseClient | null,
): Promise<string | null> {
  const fromAuth = await resolveAuthUserEmail(user, admin);
  const normalized = normalizeTemplateRecordingEmail(fromAuth);
  if (normalized) return normalized;

  if (!admin) return null;
  try {
    const { data } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const profileEmail = normalizeTemplateRecordingEmail(
      typeof data?.email === "string" ? data.email : null,
    );
    return profileEmail || null;
  } catch {
    return null;
  }
}

type TemplateRecordingAuthOk = { response: null; user: User; email: string | null; enabled: true };
type TemplateRecordingAuthFail = { response: NextResponse; user: null; email: null; enabled: false };

/** Authenticated user must be on the Link to Ad template-recording allowlist. */
export async function requireLtaTemplateRecordingUser(): Promise<
  TemplateRecordingAuthOk | TemplateRecordingAuthFail
> {
  const auth = await requireSupabaseUser();
  if (auth.response) {
    return { response: auth.response, user: null, email: null, enabled: false };
  }

  const admin = createSupabaseServiceClient();
  const email = await resolveAllowlistEmail(auth.user, admin);
  const enabled = await isLtaTemplateRecordingUser(email);
  if (!enabled) {
    return {
      response: NextResponse.json({ error: "Template recording access required" }, { status: 403 }),
      user: null,
      email: null,
      enabled: false,
    };
  }

  return { response: null, user: auth.user, email, enabled: true };
}

export async function isLtaTemplateRecordingUser(email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeTemplateRecordingEmail(email);
  if (!normalized) return false;
  if (isDefaultTemplateRecordingEmail(normalized)) return true;

  const admin = createSupabaseServiceClient();
  if (!admin) return false;

  try {
    const { data, error } = await admin
      .from("lta_template_recording_users")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    if (error) {
      if (isMissingLtaTemplateTableError(error.message)) {
        return isDefaultTemplateRecordingEmail(normalized);
      }
      return false;
    }
    return Boolean(data?.email);
  } catch {
    return isDefaultTemplateRecordingEmail(normalized);
  }
}
