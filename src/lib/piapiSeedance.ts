import { requireEnv } from "@/lib/env";

const PIAPI_BASE = "https://api.piapi.ai";
const PIAPI_TASK_PREFIX = "piapi:";

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

/** PiAPI unified task `task_type` for Seedance 2 Preview (see https://piapi.ai/docs/seedance-api/seedance-2-preview). */
export type PiapiSeedanceTaskType =
  | "seedance-2-preview"
  | "seedance-2-fast-preview";

export async function piapiCreateSeedanceTask(opts: {
  taskType: PiapiSeedanceTaskType;
  prompt: string;
  imageUrl?: string;
  duration: number;
  aspectRatio?: "16:9" | "9:16" | "3:4" | "4:3";
  overrideApiKey?: string;
}): Promise<string> {
  const apiKey = opts.overrideApiKey?.trim() || getPiApiKey();
  const duration = Math.min(15, Math.max(5, Math.round(Number(opts.duration)) || 5));

  const prompt = opts.imageUrl
    ? `@image1 ${opts.prompt}`
    : opts.prompt;

  const input: Record<string, unknown> = {
    prompt,
    duration,
    aspect_ratio: opts.aspectRatio ?? "9:16",
  };
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
    throw new Error(`Video generation could not be started (HTTP ${res.status} / ${reason})`);
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
  const res = await fetch(`${PIAPI_BASE}/api/v1/task/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${PIAPI_BASE}/api/v1/task/${encodeURIComponent(id)}`, {
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
  const video = typeof task.output?.video === "string" ? task.output.video.trim() : "";

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

export function piapiGenericTaskStatusToLegacy(
  task: PiapiGenericTask,
): { status: "SUCCESS" | "FAILED" | "IN_PROGRESS"; response: string[]; error_message: string | null } {
  const st = String(task.status ?? "").toLowerCase();
  const output = task.output ?? {};
  const video =
    firstUrlFromUnknown((output as Record<string, unknown>).video) ??
    firstUrlFromUnknown((output as Record<string, unknown>).video_url) ??
    firstUrlFromUnknown((output as Record<string, unknown>).video_urls) ??
    firstUrlFromUnknown(output);

  if ((st === "success" || st === "completed") && video) {
    return { status: "SUCCESS", response: [video], error_message: null };
  }
  if (st === "failed" || st === "fail") {
    const message = task.error?.message?.trim() || task.error?.raw_message?.trim() || "Video generation failed.";
    return { status: "FAILED", response: [], error_message: message };
  }
  return { status: "IN_PROGRESS", response: [], error_message: null };
}
