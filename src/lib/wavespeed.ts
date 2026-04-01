const WAVESPEED_API_BASE = "https://api.wavespeed.ai/api/v3";
export const WAVESPEED_HEYGEN_VIDEO_TRANSLATE_MODEL = "heygen/video-translate";
const WAVESPEED_MEDIA_UPLOAD_ENDPOINT = `${WAVESPEED_API_BASE}/media/upload/binary`;

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

  // WaveSpeed v3 wraps the payload in a `data` field:
  // { "code": 200, "message": "success", "data": { "id": "...", ... } }
  // Unwrap it so callers read fields directly.
  const inner = json?.data;
  return (inner !== null && typeof inner === "object" && !Array.isArray(inner)
    ? (inner as Record<string, unknown>)
    : json) ?? {};
}

function parsePrediction(json: Record<string, unknown>): WaveSpeedPrediction {
  return {
    id: typeof json.id === "string" ? json.id : undefined,
    status: typeof json.status === "string" ? json.status : undefined,
    outputs: Array.isArray(json.outputs)
      ? json.outputs.filter((x): x is string => typeof x === "string")
      : [],
    error: typeof json.error === "string" ? json.error : undefined,
  };
}

function isWaveSpeedHostedMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)wavespeed\.ai$/i.test(u.hostname) || /(^|\.)cdn\.wavespeed\.ai$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function guessFilenameFromUrl(url: string, contentType: string | null): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    if (/\.[a-z0-9]{2,8}$/i.test(last)) return last;
  } catch {
    /* ignore */
  }

  const extByType: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "application/octet-stream": ".mp4",
  };
  const ext = extByType[(contentType ?? "").toLowerCase()] ?? ".mp4";
  return `translate-source${ext}`;
}

async function uploadSourceVideoToWaveSpeed(videoUrl: string): Promise<string> {
  const sourceRes = await fetch(videoUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(180_000),
    headers: {
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0 (compatible; YouryStudio/1.0; wavespeed-upload)",
    },
  });
  if (!sourceRes.ok) {
    throw new Error(`Could not fetch source video (${sourceRes.status}).`);
  }

  const contentType = sourceRes.headers.get("content-type");
  const bytes = await sourceRes.arrayBuffer();
  if (!bytes.byteLength) {
    throw new Error("Source video download was empty.");
  }

  const filename = guessFilenameFromUrl(videoUrl, contentType);
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: contentType || "video/mp4" }), filename);

  const uploadRes = await fetch(WAVESPEED_MEDIA_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getWaveSpeedApiKey()}`,
    },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });

  const json = await readWaveSpeedJson(uploadRes, "WaveSpeed media upload failed.");
  const hostedUrl = typeof json.download_url === "string" ? json.download_url.trim() : "";
  if (!hostedUrl) {
    throw new Error("WaveSpeed media upload did not return a download URL.");
  }
  return hostedUrl;
}

async function ensureWaveSpeedVideoUrl(videoUrl: string): Promise<string> {
  if (isWaveSpeedHostedMediaUrl(videoUrl)) return videoUrl;
  return uploadSourceVideoToWaveSpeed(videoUrl);
}

export async function submitWaveSpeedHeygenVideoTranslate(opts: {
  videoUrl: string;
  outputLanguage: string;
}): Promise<WaveSpeedPrediction> {
  const videoUrl = opts.videoUrl.trim();
  const outputLanguage = opts.outputLanguage.trim();
  if (!videoUrl) throw new Error("Missing video URL for WaveSpeed translation.");
  if (!outputLanguage) throw new Error("Missing target language for WaveSpeed translation.");
  const hostedVideoUrl = await ensureWaveSpeedVideoUrl(videoUrl);

  const res = await fetch(`${WAVESPEED_API_BASE}/${WAVESPEED_HEYGEN_VIDEO_TRANSLATE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getWaveSpeedApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video: hostedVideoUrl,
      output_language: outputLanguage,
    }),
  });

  const json = await readWaveSpeedJson(res, "WaveSpeed translation request failed.");
  return parsePrediction(json);
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
  return parsePrediction(json);
}
