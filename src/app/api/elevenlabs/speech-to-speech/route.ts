export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { convertSpeechToSpeechWithElevenLabs } from "@/lib/elevenlabs";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { STUDIO_MEDIA_BUCKET } from "@/lib/studioGenerationsMedia";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { mergeVideoWithAudioServer } from "@/lib/mergeVideoAudio";

const UGC_UPLOADS_BUCKET = "ugc-uploads";

function messageFromUnknown(err: unknown, fallback = "Unknown error."): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "").trim();
    if (msg) return msg;
  }
  const s = String(err ?? "").trim();
  return s || fallback;
}

function isVideoFile(contentType: string, pathOrUrl: string): boolean {
  if (contentType.startsWith("video/")) return true;
  const ext = pathOrUrl.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(ext);
}

type RequestBody = {
  storagePath: string;
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

  const storagePath = (body.storagePath ?? "").trim();
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

  if (!storagePath) {
    return NextResponse.json({ error: "Missing storagePath." }, { status: 400 });
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

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role key missing on server." }, { status: 500 });
  }

  // Download the file from Supabase Storage using the admin client (works for private buckets)
  let inputBuffer: Buffer;
  let inputContentType: string;
  try {
    console.log(`[voice-change] Downloading from bucket="${UGC_UPLOADS_BUCKET}" path="${storagePath}"`);
    const { data, error } = await admin.storage.from(UGC_UPLOADS_BUCKET).download(storagePath);
    if (error || !data) {
      console.error("[voice-change] Download error:", error?.message);
      throw new Error(error?.message ?? "File not found in storage.");
    }
    inputBuffer = Buffer.from(await data.arrayBuffer());
    inputContentType = data.type || "application/octet-stream";
    console.log(`[voice-change] Downloaded ${inputBuffer.length} bytes, type=${inputContentType}`);
  } catch (dlErr) {
    const msg = messageFromUnknown(dlErr, "Could not download input file.");
    return NextResponse.json({ error: `Failed to download input file: ${msg}` }, { status: 400 });
  }

  const inputIsVideo = isVideoFile(inputContentType, storagePath);

  const ext = storagePath.split(".").pop() ?? "mp4";
  const ab = inputBuffer.buffer.slice(
    inputBuffer.byteOffset,
    inputBuffer.byteOffset + inputBuffer.byteLength,
  ) as ArrayBuffer;
  const audioFile = new File([ab], `input.${ext}`, { type: inputContentType });

  const label = voiceName ? `Voice change (${voiceName})` : "Voice change";
  const { data: inserted, error: insertError } = await supabase
    .from("studio_generations")
    .insert({
      user_id: user.id,
      kind: inputIsVideo ? "studio_video" : "studio_audio",
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
    // 1. Convert speech with ElevenLabs
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

    let finalBuffer: Buffer;
    let finalContentType: string;
    let finalExt: string;
    let resultKind: "video" | "audio";

    if (inputIsVideo) {
      // 2. Merge: mute original video + overlay new audio
      finalBuffer = await mergeVideoWithAudioServer(inputBuffer, converted.buffer);
      finalContentType = "video/mp4";
      finalExt = ".mp4";
      resultKind = "video";
    } else {
      finalBuffer = converted.buffer;
      finalContentType = converted.contentType || "audio/mpeg";
      finalExt = ".mp3";
      resultKind = "audio";
    }

    // 3. Upload result to Supabase Storage
    const resultPath = `${user.id}/${rowId}/voice-change-${crypto.randomUUID()}${finalExt}`;
    const { data: uploaded, error: uploadError } = await admin.storage
      .from(STUDIO_MEDIA_BUCKET)
      .upload(resultPath, finalBuffer, {
        contentType: finalContentType,
        upsert: false,
      });
    if (uploadError || !uploaded?.path) {
      throw new Error(uploadError?.message ?? "Could not upload result.");
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(STUDIO_MEDIA_BUCKET).getPublicUrl(uploaded.path);

    // 4. Update DB row
    const { error: updateError } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: [publicUrl],
        error_message: null,
      })
      .eq("id", rowId);
    if (updateError) throw updateError;

    // 5. Clean up uploaded input file (best-effort)
    await admin.storage.from(UGC_UPLOADS_BUCKET).remove([storagePath]).catch(() => {});

    return NextResponse.json({
      rowId,
      mediaUrl: publicUrl,
      kind: resultKind,
      provider: "elevenlabs",
      label,
    });
  } catch (err) {
    logGenerationFailure("elevenlabs/speech-to-speech", err, { rowId, voiceId });
    const rawMessage = messageFromUnknown(err);
    console.error("[voice-change] Raw error:", rawMessage);
    const userMessage = rawMessage.includes("ENOENT") || rawMessage.includes("spawn")
      ? `Server ffmpeg error: ${rawMessage}`
      : userFacingProviderErrorOrDefault(rawMessage, "Voice change failed");
    await supabase
      .from("studio_generations")
      .update({
        status: "failed",
        result_urls: null,
        error_message: userMessage,
      })
      .eq("id", rowId);
    return NextResponse.json(
      { error: userMessage },
      { status: 502 },
    );
  }
}
