import { requireEnv } from "@/lib/env";
import { walkJsonForHttpsUrls } from "@/lib/walkJsonForHttpsUrls";

const PIAPI_BASE = "https://api.piapi.ai";
const PIAPI_TASK_PREFIX = "piapi:";
/**
 * PiAPI returns flaky 502/503 a few times a day even when the input is valid;
 * we keep a generous retry budget on idempotent reads (`/task/:id`) and short
 * mutations (`/task` create) since they tolerate duplicates server-side.
 */
const PIAPI_FETCH_RETRIES = 4;

/** PiAPI Seedance 2 (Pro), max images in `omni_reference` mode. @see https://piapi.ai/docs/seedance-api/seedance-2 */
export const SEEDANCE_PRO_MAX_IMAGE_URLS = 12;

/** Pro `omni_reference`: max total items across image_urls + video_urls + audio_urls. */
export const SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS = 12;
/** Seedance Preview, max reference images. @see https://piapi.ai/docs/seedance-api/seedance-2-preview */
export const SEEDANCE_PREVIEW_MAX_IMAGE_URLS = 9;

/** Studio compact upload UI for Preview / Fast Preview (ordered `image_urls`, 1–4). */
export const SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS = 4;

/**
 * Exponential backoff with jitter. PiAPI 502/503 storms last 1–4s; the previous flat
 * 350ms × n window often expired before recovery, surfacing the failure to the user.
 * @param attempt zero-based attempt index that just failed
 */
function piapiBackoffMs(attempt: number): number {
  const base = 600 * Math.pow(2, attempt);
  const capped = Math.min(base, 4500);
  const jitter = Math.floor(Math.random() * 250);
  return capped + jitter;
}

async function fetchPiapiWithRetry(
  url: string,
  init: RequestInit,
  retries = PIAPI_FETCH_RETRIES,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || i === retries - 1) return res;
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        await new Promise((r) => setTimeout(r, piapiBackoffMs(i)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, piapiBackoffMs(i)));
        continue;
      }
    }
  }
  throw lastErr;
}

function getPiApiKey() {
  return requireEnv("PIAPI_API_KEY");
}

export function encodePiapiTaskId(taskId: string): string {
  const t = taskId.trim();
  return t.startsWith(PIAPI_TASK_PREFIX) ? t : `${PIAPI_TASK_PREFIX}${t}`;
}

export function decodePiapiTaskId(taskId: string): string {
  const t = taskId.trim();
  return t.startsWith(PIAPI_TASK_PREFIX) ? t.slice(PIAPI_TASK_PREFIX.length) : t;
}

export function isPiapiTaskId(taskId: string): boolean {
  return taskId.trim().startsWith(PIAPI_TASK_PREFIX);
}

/**
 * PiAPI unified task `task_type` values.
 * - Preview: https://piapi.ai/docs/seedance-api/seedance-2-preview
 * - Seedance 2: https://piapi.ai/docs/seedance-api/seedance-2
 */
export type PiapiSeedanceTaskType =
  | "seedance-2-preview"
  | "seedance-2-fast-preview"
  | "seedance-2-preview-vip"
  | "seedance-2-fast-preview-vip"
  | "seedance-2"
  | "seedance-2-fast";

function isSeedance2ProTaskType(t: PiapiSeedanceTaskType): boolean {
  return t === "seedance-2" || t === "seedance-2-fast";
}

/**
 * When the prompt does not already reference @imageN, prepend tags so PiAPI can bind `image_urls`
 * (see Seedance docs: @image1, @image2, …).
 */
export function ensureSeedancePromptImageTags(prompt: string, imageCount: number): string {
  const p = (prompt ?? "").trim();
  if (imageCount <= 0) return p;
  if (/\b@image\d+\b/i.test(p)) return p;
  if (imageCount === 1) return `@image1 ${p}`.trim();
  const tags = Array.from({ length: imageCount }, (_, i) => `@image${i + 1}`).join(", ");
  return `${tags}, ${p}`.trim();
}

/**
 * Prepends @imageN / @videoN / @audioN when the prompt omits that media family entirely
 * (PiAPI Seedance 2 omni_reference, see PiAPI docs).
 */
export function ensureSeedancePromptMediaTags(
  prompt: string,
  counts: { image: number; video: number; audio: number },
): string {
  const p = (prompt ?? "").trim();
  const { image: ic, video: vc, audio: ac } = counts;
  if (ic + vc + ac <= 0) return p;

  const parts: string[] = [];
  if (ic > 0 && !/\b@image\d+\b/i.test(p)) {
    parts.push(ic === 1 ? "@image1" : Array.from({ length: ic }, (_, i) => `@image${i + 1}`).join(", "));
  }
  if (vc > 0 && !/\b@video\d+\b/i.test(p)) {
    parts.push(vc === 1 ? "@video1" : Array.from({ length: vc }, (_, i) => `@video${i + 1}`).join(", "));
  }
  if (ac > 0 && !/\b@audio\d+\b/i.test(p)) {
    parts.push(ac === 1 ? "@audio1" : Array.from({ length: ac }, (_, i) => `@audio${i + 1}`).join(", "));
  }
  if (!parts.length) return p;
  return `${parts.join(" ")}, ${p}`.trim();
}

function validateSeedancePromptMaterialReferences(
  prompt: string,
  counts: { image: number; video: number; audio: number },
): void {
  const p = (prompt ?? "").trim();
  if (!p) return;

  const maxRef = (patterns: RegExp[]): number => {
    let max = 0;
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(p)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return max;
  };

  const imageMax = maxRef([/@image(\d+)\b/gi, /【\s*@图片(\d+)\s*】/gi]);
  const videoMax = maxRef([/@video(\d+)\b/gi, /【\s*@视频(\d+)\s*】/gi]);
  const audioMax = maxRef([/@audio(\d+)\b/gi, /【\s*@音频(\d+)\s*】/gi]);

  if (imageMax > counts.image) {
    throw new Error(
      `Prompt references @image${imageMax}, but only ${counts.image} image reference${counts.image === 1 ? "" : "s"} provided.`,
    );
  }
  if (videoMax > counts.video) {
    throw new Error(
      `Prompt references @video${videoMax}, but only ${counts.video} video reference${counts.video === 1 ? "" : "s"} provided.`,
    );
  }
  if (audioMax > counts.audio) {
    throw new Error(
      `Prompt references @audio${audioMax}, but only ${counts.audio} audio reference${counts.audio === 1 ? "" : "s"} provided.`,
    );
  }
}

export type PiapiSeedanceAspectRatio =
  | "16:9"
  | "9:16"
  | "3:4"
  | "4:3"
  | "21:9"
  | "1:1"
  | "auto";

export async function piapiCreateSeedanceTask(opts: {
  taskType: PiapiSeedanceTaskType;
  prompt: string;
  /** Single reference (legacy). Ignored when `imageUrls` is non-empty. */
  imageUrl?: string;
  /** Ordered reference images: @image1 = index 0, etc. */
  imageUrls?: string[];
  /** Seedance 2 Pro `omni_reference` only, motion references (MP4/MOV). */
  videoUrls?: string[];
  /** Seedance 2 Pro `omni_reference` only, MP3/WAV, ≤15s recommended. */
  audioUrls?: string[];
  /**
   * Seedance 2 Pro: use `omni_reference` when set, even if there are only two URLs after dedupe,
   * so element references are not misclassified as first+last only.
   */
  forceOmniReference?: boolean;
  /**
   * Seedance 2 Pro: force `omni_reference` (e.g. Studio mixed media strip) even with only 1–2 images.
   */
  preferOmniReference?: boolean;
  duration: number;
  aspectRatio?: PiapiSeedanceAspectRatio;
  overrideApiKey?: string;
}): Promise<string> {
  const apiKey = opts.overrideApiKey?.trim() || getPiApiKey();
  const pro = isSeedance2ProTaskType(opts.taskType);
  const duration = pro
    ? Math.min(15, Math.max(4, Math.round(Number(opts.duration)) || 5))
    : Math.min(15, Math.max(5, Math.round(Number(opts.duration)) || 5));

  const urlsRaw =
    opts.imageUrls && opts.imageUrls.length > 0
      ? opts.imageUrls
      : opts.imageUrl
        ? [opts.imageUrl]
        : [];
  const urls = urlsRaw.map((u) => String(u ?? "").trim()).filter(Boolean);
  const videoUrls = (opts.videoUrls ?? []).map((u) => String(u ?? "").trim()).filter(Boolean);
  const audioUrls = (opts.audioUrls ?? []).map((u) => String(u ?? "").trim()).filter(Boolean);
  const totalRefs = urls.length + videoUrls.length + audioUrls.length;

  const finalPrompt =
    totalRefs > 0
      ? ensureSeedancePromptMediaTags(opts.prompt, {
          image: urls.length,
          video: videoUrls.length,
          audio: audioUrls.length,
        })
      : opts.prompt.trim();
  validateSeedancePromptMaterialReferences(finalPrompt, {
    image: urls.length,
    video: videoUrls.length,
    audio: audioUrls.length,
  });

  const input: Record<string, unknown> = {
    prompt: finalPrompt,
    duration,
    aspect_ratio: opts.aspectRatio ?? "9:16",
  };

  if (pro) {
    if (totalRefs === 0) {
      input.mode = "text_to_video";
    } else {
      const useOmni =
        videoUrls.length > 0 ||
        audioUrls.length > 0 ||
        urls.length > 2 ||
        opts.forceOmniReference === true ||
        opts.preferOmniReference === true;
      if (useOmni) {
        input.mode = "omni_reference";
        if (urls.length) input.image_urls = urls;
        if (videoUrls.length) input.video_urls = videoUrls;
        if (audioUrls.length) input.audio_urls = audioUrls;
      } else {
        input.mode = "first_last_frames";
        input.image_urls = urls;
        input.aspect_ratio = "auto";
      }
    }
  } else if (urls.length > 0) {
    input.image_urls = urls;
  }

  const res = await fetchPiapiWithRetry(`${PIAPI_BASE}/api/v1/task`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "seedance",
      task_type: opts.taskType,
      input,
      // Avoid workspace default "private/HYA" pool quota surprises.
      config: {
        service_mode: "public",
      },
    }),
    cache: "no-store",
  }, 4);

  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { task_id?: string };
    error?: { message?: string; raw_message?: string };
  };
  const id = json?.data?.task_id?.trim();
  if (!res.ok || json?.code !== 200 || !id) {
    const reason =
      json?.error?.message?.trim() ||
      json?.error?.raw_message?.trim() ||
      json?.message?.trim() ||
      "Unknown error";
    const isInsufficientCredits = /insufficient.?credits/i.test(reason);
    const isVip = opts.taskType.endsWith("-vip");
    const hint = isInsufficientCredits
      ? isVip
        ? " VIP tasks cost more on the provider side. Try normal priority or top-up the provider account."
        : " Top-up the provider account (PiAPI) or use a different model."
      : "";
    throw new Error(`Video generation could not be started (HTTP ${res.status} / ${reason}).${hint}`);
  }
  return id;
}

export type PiapiSeedanceTask = {
  task_id: string;
  status: string;
  output?: { video?: string | null } | null;
  error?: { message?: string | null; raw_message?: string | null } | null;
  logs?: unknown[];
};

export type PiapiGenericTask = {
  task_id: string;
  status: string;
  output?: Record<string, unknown> | null;
  error?: { message?: string | null; raw_message?: string | null } | null;
  logs?: unknown[];
};

export async function piapiGetSeedanceTask(taskId: string, overrideApiKey?: string): Promise<PiapiSeedanceTask> {
  const apiKey = overrideApiKey?.trim() || getPiApiKey();
  const id = decodePiapiTaskId(taskId);
  const res = await fetchPiapiWithRetry(`${PIAPI_BASE}/api/v1/task/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: PiapiSeedanceTask;
  };
  if (!res.ok || json?.code !== 200 || !json?.data) {
    throw new Error(`Could not read video task status (HTTP ${res.status} / ${json?.message ?? "Unknown error"})`);
  }
  return json.data;
}

export async function piapiGetTask(taskId: string, overrideApiKey?: string): Promise<PiapiGenericTask> {
  const apiKey = overrideApiKey?.trim() || getPiApiKey();
  const id = decodePiapiTaskId(taskId);
  const res = await fetchPiapiWithRetry(`${PIAPI_BASE}/api/v1/task/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: PiapiGenericTask;
  };
  if (!res.ok || json?.code !== 200 || !json?.data) {
    throw new Error(`Could not read task status (HTTP ${res.status} / ${json?.message ?? "Unknown error"})`);
  }
  return json.data;
}

export function piapiTaskStatusToLegacy(
  task: PiapiSeedanceTask,
): { status: "SUCCESS" | "FAILED" | "IN_PROGRESS"; response: string[]; error_message: string | null } {
  const st = String(task.status ?? "").toLowerCase();
  let video = typeof task.output?.video === "string" ? task.output.video.trim() : "";

  if ((st === "success" || st === "completed") && !video) {
    const walked = walkJsonForHttpsUrls({ output: task.output, logs: task.logs });
    const pick = firstVideoLikeUrl(walked);
    if (pick) video = pick;
  }

  if ((st === "success" || st === "completed") && video) {
    return { status: "SUCCESS", response: [video], error_message: null };
  }
  if (st === "failed" || st === "fail") {
    const message = task.error?.message?.trim() || task.error?.raw_message?.trim() || "Video generation failed.";
    return { status: "FAILED", response: [], error_message: message };
  }
  return { status: "IN_PROGRESS", response: [], error_message: null };
}

function firstUrlFromUnknown(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === "string") return x.trim() || null;
  if (Array.isArray(x)) {
    for (const v of x) {
      const u = firstUrlFromUnknown(v);
      if (u) return u;
    }
    return null;
  }
  if (typeof x === "object") {
    for (const v of Object.values(x as Record<string, unknown>)) {
      const u = firstUrlFromUnknown(v);
      if (u) return u;
    }
  }
  return null;
}

function firstVideoLikeUrl(urls: string[]): string | null {
  const videoish = urls.find((u) => /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u));
  return (videoish ?? urls[0] ?? null) || null;
}

export function piapiGenericTaskStatusToLegacy(
  task: PiapiGenericTask,
): { status: "SUCCESS" | "FAILED" | "IN_PROGRESS"; response: string[]; error_message: string | null } {
  const st = String(task.status ?? "").toLowerCase();
  const output = task.output ?? {};
  let video =
    firstUrlFromUnknown((output as Record<string, unknown>).video) ??
    firstUrlFromUnknown((output as Record<string, unknown>).video_url) ??
    firstUrlFromUnknown((output as Record<string, unknown>).video_urls) ??
    firstUrlFromUnknown(output);

  if ((st === "success" || st === "completed") && !video) {
    const walked = walkJsonForHttpsUrls({ output, logs: task.logs });
    const pick = firstVideoLikeUrl(walked);
    if (pick) video = pick;
  }

  if ((st === "success" || st === "completed") && video) {
    return { status: "SUCCESS", response: [video], error_message: null };
  }
  if (st === "failed" || st === "fail") {
    const message = task.error?.message?.trim() || task.error?.raw_message?.trim() || "Video generation failed.";
    return { status: "FAILED", response: [], error_message: message };
  }
  return { status: "IN_PROGRESS", response: [], error_message: null };
}
