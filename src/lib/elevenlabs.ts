const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string | null;
  labels?: Record<string, string>;
  language?: string;
  public_owner_id?: string;
  is_shared?: boolean;
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
  const detailFromArray = Array.isArray(json?.detail)
    ? json.detail
        .map((d) => {
          if (typeof d === "string") return d.trim();
          if (d && typeof d === "object") {
            const obj = d as Record<string, unknown>;
            const msg = typeof obj.msg === "string" ? obj.msg.trim() : "";
            const loc = Array.isArray(obj.loc) ? obj.loc.map((x) => String(x)).join(".").trim() : "";
            if (msg && loc) return `${loc}: ${msg}`;
            if (msg) return msg;
          }
          return "";
        })
        .filter(Boolean)
        .join("; ")
    : "";
  const detailFromObject =
    json?.detail && typeof json.detail === "object" && !Array.isArray(json.detail)
      ? JSON.stringify(json.detail).slice(0, 240)
      : "";
  const nestedError =
    json?.error && typeof json.error === "object"
      ? (json.error as Record<string, unknown>)
      : null;
  const detail =
    detailFromArray ||
    detailFromObject ||
    (nestedError && typeof nestedError.message === "string" ? nestedError.message.trim() : "") ||
    (nestedError && typeof nestedError.raw_message === "string" ? nestedError.raw_message.trim() : "") ||
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

type ElevenLabsSharedVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string | null;
  language?: string;
  gender?: string;
  accent?: string;
  labels?: Record<string, string>;
  public_owner_id?: string;
};

export async function listElevenLabsSharedVoicesPage(opts?: {
  page?: number;
  pageSize?: number;
  featured?: boolean;
  language?: string;
  gender?: string;
  search?: string;
}): Promise<{ voices: ElevenLabsVoice[]; hasMore: boolean }> {
  const page = Math.max(0, Math.floor(Number(opts?.page ?? 0)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(opts?.pageSize ?? 100))));
  const featured = Boolean(opts?.featured ?? false);
  const language = String(opts?.language ?? "").trim();
  const gender = String(opts?.gender ?? "").trim();
  const search = String(opts?.search ?? "").trim();

  const query = new URLSearchParams({
    page_size: String(pageSize),
    page: String(page),
    featured: featured ? "true" : "false",
  });
  if (language) query.set("language", language);
  if (gender) query.set("gender", gender);
  if (search) query.set("search", search);
  const res = await fetch(`${ELEVENLABS_API_BASE}/shared-voices?${query.toString()}`, {
    method: "GET",
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
    cache: "no-store",
  });
  if (!res.ok) await readElevenLabsError(res, "Could not load shared ElevenLabs voices.");
  const json = (await res.json()) as {
    voices?: ElevenLabsSharedVoice[];
    has_more?: boolean;
  };
  const shared = Array.isArray(json.voices) ? json.voices : [];
  return {
    voices: shared.map((voice) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      category: voice.category ?? "",
      preview_url: voice.preview_url ?? "",
      labels: {
        ...(voice.labels ?? {}),
        ...(voice.gender ? { gender: voice.gender } : {}),
        ...(voice.accent ? { accent: voice.accent } : {}),
        ...(voice.language ? { language: voice.language } : {}),
      },
      language: voice.language ?? "",
      public_owner_id: voice.public_owner_id ?? "",
      is_shared: true,
    })),
    hasMore: Boolean(json.has_more),
  };
}

export async function listElevenLabsSharedVoices(maxPages = 2): Promise<ElevenLabsVoice[]> {
  const out: ElevenLabsVoice[] = [];
  for (let page = 0; page < Math.max(1, maxPages); page += 1) {
    const query = new URLSearchParams({
      page_size: "100",
      page: String(page),
      featured: "false",
    });
    const res = await fetch(`${ELEVENLABS_API_BASE}/shared-voices?${query.toString()}`, {
      method: "GET",
      headers: {
        "xi-api-key": getElevenLabsApiKey(),
      },
      cache: "no-store",
    });
    if (!res.ok) await readElevenLabsError(res, "Could not load shared ElevenLabs voices.");
    const json = (await res.json()) as {
      voices?: ElevenLabsSharedVoice[];
      has_more?: boolean;
    };
    const shared = Array.isArray(json.voices) ? json.voices : [];
    out.push(
      ...shared.map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category ?? "",
        preview_url: voice.preview_url ?? "",
        labels: voice.labels ?? {},
        language: voice.language ?? "",
        public_owner_id: voice.public_owner_id ?? "",
        is_shared: true,
      })),
    );
    if (!json.has_more) break;
  }
  return out;
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
