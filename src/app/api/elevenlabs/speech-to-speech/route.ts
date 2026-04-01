export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { convertSpeechToSpeechWithElevenLabs } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { STUDIO_MEDIA_BUCKET } from "@/lib/studioGenerationsMedia";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

function extFromOutputFormat(outputFormat: string): string {
  const f = outputFormat.trim().toLowerCase();
  if (f.startsWith("mp3_")) return ".mp3";
  if (f.startsWith("opus_")) return ".opus";
  if (f.startsWith("pcm_")) return ".wav";
  if (f.startsWith("ulaw_")) return ".ulaw";
  if (f.startsWith("alaw_")) return ".alaw";
  return ".mp3";
}

function contentTypeFromOutputFormat(outputFormat: string): string {
  const f = outputFormat.trim().toLowerCase();
  if (f.startsWith("mp3_")) return "audio/mpeg";
  if (f.startsWith("opus_")) return "audio/ogg";
  if (f.startsWith("pcm_")) return "audio/wav";
  if (f.startsWith("ulaw_")) return "audio/basic";
  if (f.startsWith("alaw_")) return "audio/basic";
  return "audio/mpeg";
}

function messageFromUnknown(err: unknown, fallback = "Unknown error."): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "").trim();
    if (msg) return msg;
  }
  const s = String(err ?? "").trim();
  return s || fallback;
}

type RequestBody = {
  audioUrl: string;
  voiceId: string;
  voiceName?: string;
  outputFormat?: string;
  modelId?: string;
  voiceSettingsJson?: string;
  fileFormat?: string;
  seed?: string;
  removeBackgroundNoise?: boolean;
  enableLogging?: boolean;
  optimizeStreamingLatency?: string;
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const audioUrl = (body.audioUrl ?? "").trim();
  const voiceId = (body.voiceId ?? "").trim();
  const voiceName = (body.voiceName ?? "").trim();
  const outputFormat = (body.outputFormat ?? "mp3_44100_128").trim() || "mp3_44100_128";
  const modelId = (body.modelId ?? "").trim();
  const voiceSettingsJson = (body.voiceSettingsJson ?? "").trim();
  const fileFormatRaw = (body.fileFormat ?? "").trim();
  const fileFormat =
    fileFormatRaw === "pcm_s16le_16" || fileFormatRaw === "other" ? fileFormatRaw : undefined;
  const seedRaw = (body.seed ?? "").toString().trim();
  const seed = seedRaw ? Number(seedRaw) : undefined;
  const removeBackgroundNoise = body.removeBackgroundNoise === true;
  const enableLogging =
    body.enableLogging === true ? true : body.enableLogging === false ? false : undefined;
  const optimizeLatencyRaw = (body.optimizeStreamingLatency ?? "").toString().trim();
  const optimizeStreamingLatency =
    ["0", "1", "2", "3", "4"].includes(optimizeLatencyRaw)
      ? (Number(optimizeLatencyRaw) as 0 | 1 | 2 | 3 | 4)
      : undefined;

  if (!audioUrl) {
    return NextResponse.json({ error: "Missing audioUrl." }, { status: 400 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: "Missing ElevenLabs voice id." }, { status: 400 });
  }
  if (typeof seed === "number" && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)) {
    return NextResponse.json(
      { error: "Invalid seed. Must be an integer between 0 and 4294967295." },
      { status: 400 },
    );
  }

  // Download the audio/video from the provided URL (Supabase Storage)
  let audioFile: File;
  try {
    const dlRes = await fetch(audioUrl);
    if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
    const blob = await dlRes.blob();
    const ext = audioUrl.split(/[?#]/)[0].split(".").pop() ?? "mp4";
    audioFile = new File([blob], `input.${ext}`, { type: blob.type || "application/octet-stream" });
  } catch (dlErr) {
    const msg = messageFromUnknown(dlErr, "Could not download audio file.");
    return NextResponse.json({ error: `Failed to download input file: ${msg}` }, { status: 400 });
  }

  const label = voiceName ? `Voice change (${voiceName})` : "Voice change";
  const { data: inserted, error: insertError } = await supabase
    .from("studio_generations")
    .insert({
      user_id: user.id,
      kind: "studio_audio",
      status: "processing",
      label,
      external_task_id: `elevenlabs-sync:${crypto.randomUUID()}`,
      provider: "elevenlabs",
      credits_charged: 0,
      uses_personal_api: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    const msg = messageFromUnknown(insertError, "Could not create studio row.");
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(msg, "Could not create studio row.") }, { status: 502 });
  }

  const rowId = String(inserted.id);

  try {
    const converted = await convertSpeechToSpeechWithElevenLabs({
      voiceId,
      audioFile,
      modelId: modelId || undefined,
      voiceSettingsJson: voiceSettingsJson || undefined,
      seed: typeof seed === "number" && Number.isFinite(seed) ? seed : undefined,
      removeBackgroundNoise,
      fileFormat,
      outputFormat,
      optimizeStreamingLatency,
      enableLogging,
    });

    const admin = createSupabaseServiceClient();
    if (!admin) throw new Error("Supabase service role key missing on server.");

    const ext = extFromOutputFormat(outputFormat);
    const storagePath = `${user.id}/${rowId}/voice-change-${crypto.randomUUID()}${ext}`;
    const ct = converted.contentType || contentTypeFromOutputFormat(outputFormat);
    const { data: uploaded, error: uploadError } = await admin.storage
      .from(STUDIO_MEDIA_BUCKET)
      .upload(storagePath, converted.buffer, {
        contentType: ct,
        upsert: false,
      });
    if (uploadError || !uploaded?.path) {
      throw new Error(uploadError?.message ?? "Could not upload ElevenLabs output.");
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(STUDIO_MEDIA_BUCKET).getPublicUrl(uploaded.path);

    const { error: updateError } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: [publicUrl],
        error_message: null,
      })
      .eq("id", rowId);
    if (updateError) throw updateError;

    return NextResponse.json({
      rowId,
      mediaUrl: publicUrl,
      provider: "elevenlabs",
      label,
      outputFormat,
    });
  } catch (err) {
    logGenerationFailure("elevenlabs/speech-to-speech", err, { rowId, voiceId });
    const message = messageFromUnknown(err);
    await supabase
      .from("studio_generations")
      .update({
        status: "failed",
        result_urls: null,
        error_message: userFacingProviderErrorOrDefault(message, "Voice change failed"),
      })
      .eq("id", rowId);
    return NextResponse.json(
      { error: userFacingProviderErrorOrDefault(message, "Voice change failed") },
      { status: 502 },
    );
  }
}
