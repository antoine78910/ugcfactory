import { NextResponse, after } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { brevoUpsertContact } from "@/lib/brevo";

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workType =
    typeof body === "object" && body !== null && "work_type" in body
      ? String((body as { work_type: unknown }).work_type)
      : "";
  const referralSource =
    typeof body === "object" && body !== null && "referral_source" in body
      ? String((body as { referral_source: unknown }).referral_source)
      : "";

  const userId = auth.user.id;
  const email = auth.user.email?.trim() ?? "";
  const admin = createSupabaseServiceClient();

  // Critical path: Postgres upsert only (fast). Auth `updateUserById` often takes seconds, defer it.
  if (admin) {
    try {
      await admin.from("user_onboarding").upsert(
        { user_id: userId, work_type: workType, referral_source: referralSource },
        { onConflict: "user_id" },
      );
    } catch {
      // non-blocking
    }
  }

  after(async () => {
    if (admin) {
      try {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: {
            onboarding_work_type: workType,
            onboarding_referral_source: referralSource,
            onboarding_completed: true,
          },
        });
      } catch {
        /* non-blocking */
      }
    }
    if (email) {
      try {
        await brevoUpsertContact(email, {
          WORK_TYPE: workType,
          REFERRAL_SOURCE: referralSource,
        });
      } catch {
        /* brevoUpsertContact already logs */
      }
    }
  });

  return NextResponse.json({ ok: true });
}
