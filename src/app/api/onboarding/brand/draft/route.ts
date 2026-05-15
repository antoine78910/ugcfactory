export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type DraftState = Record<string, unknown>;

function clampStep(n: unknown): 1 | 2 | 3 {
  const x = typeof n === "number" ? n : typeof n === "string" ? Number(n) : 1;
  if (x === 2 || x === 3) return x;
  return 1;
}

/** GET current user's saved onboarding draft (or null). */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("brand_onboarding_drafts")
    .select("step,state,updated_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    if (/brand_onboarding_drafts/.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json(null);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json(null);
  return NextResponse.json({
    step: clampStep(data.step),
    state: (data.state && typeof data.state === "object" ? data.state : {}) as DraftState,
    updatedAt: data.updated_at ?? null,
  });
}

type PutBody = {
  step?: unknown;
  state?: unknown;
};

/** Upsert onboarding draft for the current user. */
export async function PUT(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const step = clampStep(body.step);
  const state = body.state && typeof body.state === "object" ? (body.state as DraftState) : {};
  const now = new Date().toISOString();

  const { data, error } = await auth.supabase
    .from("brand_onboarding_drafts")
    .upsert(
      {
        user_id: auth.user.id,
        step,
        state,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("step,state,updated_at")
    .maybeSingle();

  if (error) {
    if (/brand_onboarding_drafts/.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Table brand_onboarding_drafts is missing. Apply the latest Supabase migration." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    step: clampStep(data?.step),
    state: (data?.state && typeof data.state === "object" ? data.state : {}) as DraftState,
    updatedAt: data?.updated_at ?? now,
  });
}

/** Remove draft after successful final save (or explicit abandon). */
export async function DELETE() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { error } = await auth.supabase.from("brand_onboarding_drafts").delete().eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
