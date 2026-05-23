import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  isDefaultTemplateRecordingEmail,
  normalizeTemplateRecordingEmail,
} from "@/lib/ltaTemplateRecording";

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
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("relation") && msg.includes("does not exist")) {
        return isDefaultTemplateRecordingEmail(normalized);
      }
      return false;
    }
    return Boolean(data?.email);
  } catch {
    return isDefaultTemplateRecordingEmail(normalized);
  }
}
