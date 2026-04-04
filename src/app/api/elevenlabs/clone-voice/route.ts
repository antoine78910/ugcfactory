export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createElevenLabsVoiceClone } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

const MAX_FILES = 25;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/octet-stream",
]);

function isAcceptedAudioType(type: string): boolean {
  if (!type) return true; // allow unknown content-type, ElevenLabs will validate
  const lower = type.toLowerCase().split(";")[0].trim();
  return ALLOWED_AUDIO_TYPES.has(lower) || lower.startsWith("audio/") || lower.startsWith("video/");
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const labelsRaw = String(formData.get("labels") ?? "").trim();
  const personalApiKey = String(formData.get("personalApiKey") ?? "").trim() || undefined;

  if (!name) {
    return NextResponse.json({ error: "Voice name is required." }, { status: 400 });
  }

  let labels: Record<string, string> | undefined;
  if (labelsRaw) {
    try {
      labels = JSON.parse(labelsRaw) as Record<string, string>;
    } catch {
      return NextResponse.json({ error: "Invalid labels JSON." }, { status: 400 });
    }
  }

  const rawFiles = formData.getAll("files");
  const files: File[] = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

  if (!files.length) {
    return NextResponse.json({ error: "At least one audio file is required." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed.` }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds the 10 MB size limit.` },
        { status: 400 },
      );
    }
    if (!isAcceptedAudioType(file.type)) {
      return NextResponse.json(
        { error: `File "${file.name}" has an unsupported type (${file.type}).` },
        { status: 400 },
      );
    }
  }

  try {
    const result = await createElevenLabsVoiceClone({
      name,
      files,
      description: description || undefined,
      labels,
      apiKeyOverride: personalApiKey,
    });

    return NextResponse.json({ voiceId: result.voiceId, name: result.name });
  } catch (err) {
    logGenerationFailure("elevenlabs/clone-voice", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
