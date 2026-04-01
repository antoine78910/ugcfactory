const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string | null;
  labels?: Record<string, string>;
};

export type ElevenLabsSpeechToSpeechInput = {
  voiceId: string;
  audioFile: File;
  modelId?: string;
  voiceSettingsJson?: string;
  seed?: number;
  removeBackgroundNoise?: boolean;
  fileFormat?: "pcm_s16le_16" | "other";
  outputFormat?: string;
  optimizeStreamingLatency?: 0 | 1 | 2 | 3 | 4;
  enableLogging?: boolean;
};

function getElevenLabsApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ElevenLabs API key missing on server. Set ELEVENLABS_API_KEY.");
  return key;
}

async function readElevenLabsError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  const detail =
    (typeof json?.detail === "string" && json.detail.trim()) ||
    (typeof json?.message === "string" && json.message.trim()) ||
    (typeof json?.error === "string" && json.error.trim()) ||
    text.trim().slice(0, 240) ||
    fallback;
  throw new Error(detail);
}

export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${ELEVENLABS_API_BASE}/voices?show_legacy=true`, {
    method: "GET",
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
    cache: "no-store",
  });
  if (!res.ok) await readElevenLabsError(res, "Could not load ElevenLabs voices.");
  const json = (await res.json()) as { voices?: ElevenLabsVoice[] };
  return Array.isArray(json.voices) ? json.voices : [];
}

export async function convertSpeechToSpeechWithElevenLabs(
  input: ElevenLabsSpeechToSpeechInput,
): Promise<{ buffer: Buffer; contentType: string }> {
  const voiceId = input.voiceId.trim();
  if (!voiceId) throw new Error("Missing ElevenLabs voice id.");

  const query = new URLSearchParams();
  if (typeof input.enableLogging === "boolean") query.set("enable_logging", String(input.enableLogging));
  if (typeof input.optimizeStreamingLatency === "number") {
    query.set("optimize_streaming_latency", String(input.optimizeStreamingLatency));
  }
  if (input.outputFormat?.trim()) query.set("output_format", input.outputFormat.trim());

  const form = new FormData();
  form.set("audio", input.audioFile);
  if (input.modelId?.trim()) form.set("model_id", input.modelId.trim());
  if (input.voiceSettingsJson?.trim()) form.set("voice_settings", input.voiceSettingsJson.trim());
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) form.set("seed", String(input.seed));
  if (typeof input.removeBackgroundNoise === "boolean") {
    form.set("remove_background_noise", String(input.removeBackgroundNoise));
  }
  if (input.fileFormat) form.set("file_format", input.fileFormat);

  const res = await fetch(
    `${ELEVENLABS_API_BASE}/speech-to-speech/${encodeURIComponent(voiceId)}${query.size ? `?${query}` : ""}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getElevenLabsApiKey(),
      },
      body: form,
      cache: "no-store",
    },
  );

  if (!res.ok) await readElevenLabsError(res, "ElevenLabs voice conversion failed.");
  const bytes = await res.arrayBuffer();
  const buffer = Buffer.from(bytes);
  if (!buffer.length) throw new Error("ElevenLabs returned empty audio.");
  return {
    buffer,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
