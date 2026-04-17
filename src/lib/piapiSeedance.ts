import { requireEnv } from "@/lib/env";
import { walkJsonForHttpsUrls } from "@/lib/walkJsonForHttpsUrls";

const PIAPI_BASE = "https://api.piapi.ai";
const PIAPI_TASK_PREFIX = "piapi:";
const PIAPI_FETCH_RETRIES = 3;

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
        await new Promise((r) => setTimeout(r, 350 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 350 * (i + 1)));
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

export async function piapiCreateSeedanceTask(opts: {
  taskType: PiapiSeedanceTaskType;
  prompt: string;
  imageUrl?: string;
  duration: number;
  aspectRatio?: "16:9" | "9:16" | "3:4" | "4:3";
  overrideApiKey?: string;
}): Promise<string> {
  const apiKey = opts.overrideApiKey?.trim() || getPiApiKey();
  const pro = isSeedance2ProTaskType(opts.taskType);
  const duration = pro
    ? Math.min(15, Math.max(4, Math.round(Number(opts.duration)) || 5))
    : Math.min(15, Math.max(5, Math.round(Number(opts.duration)) || 5));

  const prompt = opts.imageUrl
    ? `@image1 ${opts.prompt}`
    : opts.prompt;

  const input: Record<string, unknown> = {
    prompt,
    duration,
    aspect_ratio: opts.aspectRatio ?? "9:16",
  };
  if (pro) {
    input.mode = opts.imageUrl ? "first_last_frames" : "text_to_video";
  }
  if (opts.imageUrl) {
    input.image_urls = [opts.imageUrl];
  }
  const res = await fetch(`${PIAPI_BASE}/api/v1/task`, {
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
  });

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
