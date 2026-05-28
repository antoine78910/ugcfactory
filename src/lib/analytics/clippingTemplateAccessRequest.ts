import type { SupabaseClient } from "@supabase/supabase-js";

/** Record email from clipping hub + auto-enable Link to Ad template toggle (admin-tracked). */
export async function recordClippingTemplateAccessRequest(
  admin: SupabaseClient,
  visitorId: string,
  email: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new Error("Invalid email");
  }
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("clipping_template_signups")
    .select("visitor_id, first_clicked_at")
    .eq("visitor_id", visitorId)
    .maybeSingle();

  const allowList = admin
    .from("lta_template_recording_users")
    .upsert({ email: normalizedEmail }, { onConflict: "email" });

  if (existing) {
    const [{ error: signupErr }, { error: allowErr }] = await Promise.all([
      admin
        .from("clipping_template_signups")
        .update({
          email: normalizedEmail,
          template_access_granted_at: now,
        })
        .eq("visitor_id", visitorId),
      allowList,
    ]);
    if (signupErr) throw signupErr;
    if (allowErr) throw allowErr;
  } else {
    const [{ error: signupErr }, { error: allowErr }] = await Promise.all([
      admin.from("clipping_template_signups").insert({
        visitor_id: visitorId,
        email: normalizedEmail,
        first_clicked_at: now,
        template_access_granted_at: now,
      }),
      allowList,
    ]);
    if (signupErr) throw signupErr;
    if (allowErr) throw allowErr;
  }
}
