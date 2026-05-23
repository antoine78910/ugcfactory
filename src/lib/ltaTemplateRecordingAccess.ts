import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
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
