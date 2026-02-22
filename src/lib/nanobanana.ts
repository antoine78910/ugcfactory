import { requireEnv } from "@/lib/env";

const API_BASE = "https://api.nanobananaapi.ai";

export type NanoBananaType = "TEXTTOIAMGE" | "IMAGETOIAMGE";

export type NanoBananaImageSize =
  | "1:1"
  | "9:16"
  | "16:9"
  | "3:4"
  | "4:3"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5"
  | "21:9";

export type NanoBananaGenerateRequest = {
  prompt: string;
  type: NanoBananaType;
  callBackUrl: string;
  imageUrls?: string[];
  numImages?: number;
  watermark?: string;
  image_size?: NanoBananaImageSize;
};

export type NanoBananaProResolution = "1K" | "2K" | "4K";
export type NanoBananaProAspectRatio =
  | NanoBananaImageSize
  | "auto";

export type NanoBananaProGenerateRequest = {
  prompt: string;
  imageUrls?: string[];
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
  callBackUrl?: string;
};

type NanoBananaGenerateResponse =
  | { code: 200; msg: string; data: { taskId: string } }
  | { code: number; msg: string; data?: unknown };

export async function nanoBananaGenerate(req: NanoBananaGenerateRequest) {
  const apiKey = requireEnv("NANOBANANA_API_KEY");

  const res = await fetch(`${API_BASE}/api/v1/nanobanana/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    cache: "no-store",
  });

  const json = (await res.json()) as NanoBananaGenerateResponse;
  const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data
    ?.taskId;

  if (!res.ok || json.code !== 200 || typeof taskId !== "string") {
    throw new Error(
      `NanoBanana generate failed: HTTP ${res.status} / code ${json.code} / ${json.msg}`,
    );
  }

  return taskId;
}

type NanoBananaProGenerateResponse =
  | { code: 200; message: string; data: { taskId: string } }
  | { code: number; message: string; data?: unknown };

export async function nanoBananaGeneratePro(req: NanoBananaProGenerateRequest) {
  const apiKey = requireEnv("NANOBANANA_API_KEY");

  const res = await fetch(`${API_BASE}/api/v1/nanobanana/generate-pro`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    cache: "no-store",
  });

  const json = (await res.json()) as NanoBananaProGenerateResponse;
  const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data
    ?.taskId;

  if (!res.ok || json.code !== 200 || typeof taskId !== "string") {
    const code = (json as unknown as { code?: unknown })?.code;
    const msg =
      (json as unknown as { message?: unknown })?.message ??
      `HTTP ${res.status}`;
    throw new Error(
      `NanoBanana Pro generate failed: HTTP ${res.status} / code ${String(code)} / ${String(msg)}`,
    );
  }

  return taskId;
}

export type NanoBananaTaskResponse =
  | {
      code: 200;
      msg: string;
      data: {
        taskId: string;
        completeTime?: string;
        createTime?: string;
        successFlag: 0 | 1 | 2 | 3;
        errorCode?: number;
        errorMessage?: string;
        response?: {
          originImageUrl?: string;
          resultImageUrl?: string | string[];
        };
      };
    }
  | { code: number; msg: string; data?: unknown };

export async function nanoBananaGetTask(taskId: string) {
  const apiKey = requireEnv("NANOBANANA_API_KEY");

  const url = new URL(`${API_BASE}/api/v1/nanobanana/record-info`);
  url.searchParams.set("taskId", taskId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const json = (await res.json()) as NanoBananaTaskResponse;
  const data = (json as unknown as { data?: unknown })?.data as
    | {
        taskId?: unknown;
        successFlag?: unknown;
        response?: unknown;
        errorMessage?: unknown;
      }
    | undefined;

  if (!res.ok || json.code !== 200 || typeof data?.successFlag !== "number") {
    throw new Error(
      `NanoBanana task failed: HTTP ${res.status} / code ${json.code} / ${json.msg}`,
    );
  }

  return data as {
    taskId: string;
    completeTime?: string;
    createTime?: string;
    successFlag: 0 | 1 | 2 | 3;
    errorCode?: number;
    errorMessage?: string;
    response?: {
      originImageUrl?: string;
      resultImageUrl?: string | string[];
    };
  };
}

