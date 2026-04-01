export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listElevenLabsSharedVoices, listElevenLabsVoices } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function GET() {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const [accountVoices, sharedVoices] = await Promise.all([
      listElevenLabsVoices(),
      listElevenLabsSharedVoices(2),
    ]);
    const byId = new Map<string, (typeof accountVoices)[number]>();
    for (const voice of [...sharedVoices, ...accountVoices]) {
      if (!voice.voice_id) continue;
      byId.set(voice.voice_id, voice);
    }
    const voices = [...byId.values()];
    return NextResponse.json({
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
