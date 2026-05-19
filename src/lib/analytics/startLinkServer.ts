import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordStartLinkClick(
  admin: SupabaseClient,
  visitorId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: clickErr } = await admin.from("start_link_clicks").insert({
    visitor_id: visitorId,
    clicked_at: now,
  });
  if (clickErr) throw clickErr;

  const { error: attrErr } = await admin.from("start_link_attributions").upsert(
    { visitor_id: visitorId, first_clicked_at: now },
    { onConflict: "visitor_id", ignoreDuplicates: true },
  );
  if (attrErr) throw attrErr;
}

export async function recordStartLinkSignup(
  admin: SupabaseClient,
  visitorId: string,
  userId: string,
): Promise<void> {
  if (!visitorId || !userId) return;
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("start_link_attributions")
    .select("visitor_id, first_clicked_at")
    .eq("visitor_id", visitorId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("start_link_attributions")
      .update({ user_id: userId, signed_up_at: now })
      .eq("visitor_id", visitorId);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("start_link_attributions").insert({
    visitor_id: visitorId,
    first_clicked_at: now,
    user_id: userId,
    signed_up_at: now,
  });
  if (error) throw error;
}

export async function recordStartLinkPayment(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!userId) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("start_link_attributions")
    .update({ paid_at: now })
    .eq("user_id", userId)
    .is("paid_at", null);
  if (error) throw error;
}
