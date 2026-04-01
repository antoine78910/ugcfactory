const WAVESPEED_API_BASE = "https://api.wavespeed.ai/api/v3";
export const WAVESPEED_HEYGEN_VIDEO_TRANSLATE_MODEL = "heygen/video-translate";

export type WaveSpeedPrediction = {
  id?: string;
  status?: string;
  outputs?: string[];
  error?: string;
};

function getWaveSpeedApiKey(): string {
  const key = process.env.WAVESPEED_API_KEY?.trim();
  if (!key) {
    throw new Error("WaveSpeed API key missing on server. Set WAVESPEED_API_KEY.");
  }
  return key;
}

async function readWaveSpeedJson(res: Response, fallbackMessage: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = null;
  }

  if (!res.ok) {
    const error =
      (typeof json?.error === "string" && json.error.trim()) ||
      (typeof json?.message === "string" && json.message.trim()) ||
      text.trim().slice(0, 240) ||
      fallbackMessage;
    throw new Error(error);
  }

  return json ?? {};
}

export async function submitWaveSpeedHeygenVideoTranslate(opts: {
  videoUrl: string;
  outputLanguage: string;
}): Promise<WaveSpeedPrediction> {
  const videoUrl = opts.videoUrl.trim();
  const outputLanguage = opts.outputLanguage.trim();
  if (!videoUrl) throw new Error("Missing video URL for WaveSpeed translation.");
  if (!outputLanguage) throw new Error("Missing target language for WaveSpeed translation.");

  const res = await fetch(`${WAVESPEED_API_BASE}/${WAVESPEED_HEYGEN_VIDEO_TRANSLATE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getWaveSpeedApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video: videoUrl,
      output_language: outputLanguage,
    }),
  });

  const json = await readWaveSpeedJson(res, "WaveSpeed translation request failed.");
  return {
    id: typeof json.id === "string" ? json.id : undefined,
    status: typeof json.status === "string" ? json.status : undefined,
    outputs: Array.isArray(json.outputs) ? json.outputs.filter((x): x is string => typeof x === "string") : [],
    error: typeof json.error === "string" ? json.error : undefined,
  };
}

export async function getWaveSpeedPrediction(taskId: string): Promise<WaveSpeedPrediction> {
  const id = taskId.trim();
  if (!id) throw new Error("Missing WaveSpeed task id.");

  const res = await fetch(`${WAVESPEED_API_BASE}/predictions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getWaveSpeedApiKey()}`,
    },
    cache: "no-store",
  });

  const json = await readWaveSpeedJson(res, "WaveSpeed prediction lookup failed.");
  return {
    id: typeof json.id === "string" ? json.id : undefined,
    status: typeof json.status === "string" ? json.status : undefined,
    outputs: Array.isArray(json.outputs) ? json.outputs.filter((x): x is string => typeof x === "string") : [],
    error: typeof json.error === "string" ? json.error : undefined,
  };
}
