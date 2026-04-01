export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

const FAVORITES_KEY = "favorite_eleven_voice_ids";

function parseFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 200);
}

export async function GET() {
  const { user, response } = await requireSupabaseUser();
  if (response || !user) return response;

  const favorites = parseFavoriteIds((user.user_metadata as Record<string, unknown> | undefined)?.[FAVORITES_KEY]);
  return NextResponse.json({ favorites });
}

export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
  if (response || !user) return response;

  const body = (await req.json().catch(() => ({}))) as { favorites?: unknown };
  const favorites = parseFavoriteIds(body.favorites);

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role key missing on server." }, { status: 500 });
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    [FAVORITES_KEY]: favorites,
  };

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMeta,
  });
  if (error) {
    return NextResponse.json({ error: error.message || "Could not save favorites." }, { status: 502 });
  }

  return NextResponse.json({ favorites });
}
