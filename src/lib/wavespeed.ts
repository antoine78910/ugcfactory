import { walkJsonForHttpsUrls } from "@/lib/walkJsonForHttpsUrls";

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
    throw new Error("Translation service is not configured on the server.");
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

  // WaveSpeed v3 wraps the payload in `data`, but some fields (e.g. `outputs`) may sit on the envelope.
  const root = json ?? {};
  const inner = root.data;
  const innerObj =
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};
  return { ...root, ...innerObj };
}

async function fetchWaveSpeedJson(
  endpoint: string,
  fallbackMessage: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getWaveSpeedApiKey()}`,
    },
    cache: "no-store",
  });
  return readWaveSpeedJson(res, fallbackMessage);
}

/**
 * WaveSpeed v3 payloads vary by model: some use `outputs[]`, others a single `output` / `result` URL string
 * or nested `data`. Missing URLs here kept rows stuck “processing” with empty history previews.
 */
function extractWaveSpeedOutputUrls(json: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim()) out.push(s.trim());
  };
  const data = json.data;
  const inner = data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

  const arrays = [
    json.outputs,
    json.output_urls,
    json.result_urls,
    inner?.outputs,
    inner?.output_urls,
    inner?.result_urls,
  ];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const x of arr) push(x);
  }

  const singles = [
    json.output,
    json.result,
    json.result_url,
    json.resultUrl,
    json.video,
    json.video_url,
    json.videoUrl,
    json.url,
    inner?.output,
    inner?.result,
    inner?.result_url,
    inner?.resultUrl,
    inner?.video,
    inner?.video_url,
    inner?.url,
  ];
  for (const s of singles) push(s);

  return [...new Set(out)];
}

function parsePrediction(json: Record<string, unknown>): WaveSpeedPrediction {
  let urls = extractWaveSpeedOutputUrls(json);
  if (urls.length === 0) {
    urls = walkJsonForHttpsUrls(json);
  }
  return {
    id: typeof json.id === "string" ? json.id : undefined,
    status: typeof json.status === "string" ? json.status : undefined,
    outputs: urls,
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

  const json = await readWaveSpeedJson(uploadRes, "Media upload failed.");
  const hostedUrl = typeof json.download_url === "string" ? json.download_url.trim() : "";
  if (!hostedUrl) {
    throw new Error("Media upload did not return a download URL.");
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
  if (!videoUrl) throw new Error("Missing video URL for translation.");
  if (!outputLanguage) throw new Error("Missing target language for translation.");
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

  const json = await readWaveSpeedJson(res, "Translation request failed.");
  return parsePrediction(json);
}

export async function getWaveSpeedPrediction(taskId: string): Promise<WaveSpeedPrediction> {
  const id = taskId.trim();
  if (!id) throw new Error("Missing translation task id.");

  const encodedId = encodeURIComponent(id);
  const endpoints = [
    `${WAVESPEED_API_BASE}/predictions/${encodedId}/result`,
    `${WAVESPEED_API_BASE}/predictions/${encodedId}`,
  ];

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      const json = await fetchWaveSpeedJson(endpoint, "Prediction lookup failed.");
      return parsePrediction(json);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
      const isLookupMiss =
        /\b404\b/.test(message) ||
        message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("expired");
      if (!isLookupMiss) throw err;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Prediction lookup failed."));
}
