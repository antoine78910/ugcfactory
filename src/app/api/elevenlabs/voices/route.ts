export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listElevenLabsSharedVoicesPage, listElevenLabsVoices } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const sharedPage = Math.max(0, Math.floor(Number(searchParams.get("sharedPage") ?? 0)));
    const sharedPageSize = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("sharedPageSize") ?? 100))));
    const includeAccount = (searchParams.get("includeAccount") ?? "true").toLowerCase() !== "false";
    const language = (searchParams.get("language") ?? "").trim();
    const gender = (searchParams.get("gender") ?? "").trim();
    const search = (searchParams.get("search") ?? "").trim();

    const [accountVoices, sharedPageOut] = await Promise.all([
      includeAccount ? listElevenLabsVoices() : Promise.resolve([]),
      listElevenLabsSharedVoicesPage({
        page: sharedPage,
        pageSize: sharedPageSize,
        featured: false,
        language: language || undefined,
        gender: gender || undefined,
        search: search || undefined,
      }),
    ]);
    const sharedVoices = sharedPageOut.voices;
    const byId = new Map<string, (typeof accountVoices)[number]>();
    for (const voice of [...sharedVoices, ...accountVoices]) {
      if (!voice.voice_id) continue;
      byId.set(voice.voice_id, voice);
    }
    const voices = [...byId.values()];
    return NextResponse.json({
      sharedHasMore: sharedPageOut.hasMore,
      voices: voices
        .map((voice) => ({
          voiceId: voice.voice_id,
          name: voice.name,
          category: voice.category ?? "",
          previewUrl: voice.preview_url ?? "",
          labels: voice.labels ?? {},
          language: voice.language ?? "",
          publicOwnerId: voice.public_owner_id ?? "",
          isShared: Boolean(voice.is_shared),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    logGenerationFailure("elevenlabs/voices", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
