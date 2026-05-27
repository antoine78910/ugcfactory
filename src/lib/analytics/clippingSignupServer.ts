import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordClippingSignupClick(
  admin: SupabaseClient,
  visitorId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: clickErr } = await admin.from("clipping_template_signup_clicks").insert({
    visitor_id: visitorId,
    clicked_at: now,
  });
  if (clickErr) throw clickErr;

  const { error: attrErr } = await admin.from("clipping_template_signups").upsert(
    { visitor_id: visitorId, first_clicked_at: now },
    { onConflict: "visitor_id", ignoreDuplicates: true },
  );
  if (attrErr) throw attrErr;
}

export async function recordClippingTemplateSignup(
  admin: SupabaseClient,
  visitorId: string,
  userId: string,
  email: string,
): Promise<void> {
  if (!visitorId || !userId || !email.trim()) return;
  const now = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing } = await admin
    .from("clipping_template_signups")
    .select("visitor_id, first_clicked_at")
    .eq("visitor_id", visitorId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("clipping_template_signups")
      .update({
        user_id: userId,
        email: normalizedEmail,
        signed_up_at: now,
      })
      .eq("visitor_id", visitorId);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("clipping_template_signups").insert({
    visitor_id: visitorId,
    user_id: userId,
    email: normalizedEmail,
    first_clicked_at: now,
    signed_up_at: now,
  });
  if (error) throw error;
}
