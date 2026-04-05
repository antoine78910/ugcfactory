export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getElevenLabsVoiceById } from "@/lib/elevenlabs";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

function mapVoice(v: NonNullable<Awaited<ReturnType<typeof getElevenLabsVoiceById>>>) {
  return {
    voiceId: v.voice_id,
    name: v.name,
    category: v.category ?? "",
    previewUrl: v.preview_url ?? "",
    labels: v.labels ?? {},
    language: v.language ?? "",
    publicOwnerId: v.public_owner_id ?? "",
    isShared: Boolean(v.is_shared),
  };
}

/**
 * POST body: `{ ids: string[] }` — resolve voice metadata for saved favorite IDs
 * not yet present in the client’s loaded list (e.g. not on current shared page).
 */
export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = typeof body === "object" && body !== null && "ids" in body ? (body as { ids: unknown }).ids : [];
  const ids = [...new Set(Array.isArray(raw) ? raw.map((x) => String(x ?? "").trim()).filter(Boolean) : [])].slice(
    0,
    48,
  );

  if (ids.length === 0) {
    return NextResponse.json({ voices: [] });
  }

  const settled = await Promise.all(ids.map((id) => getElevenLabsVoiceById(id)));
  const voices = settled.filter(Boolean).map((v) => mapVoice(v!));

  return NextResponse.json({ voices });
}
