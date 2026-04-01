export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listElevenLabsVoices } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function GET() {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const voices = await listElevenLabsVoices();
    return NextResponse.json({
      voices: voices
        .map((voice) => ({
          voiceId: voice.voice_id,
          name: voice.name,
          category: voice.category ?? "",
          previewUrl: voice.preview_url ?? "",
          labels: voice.labels ?? {},
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    logGenerationFailure("elevenlabs/voices", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
