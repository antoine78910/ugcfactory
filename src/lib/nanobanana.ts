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

/** Aspect ratios supported by `POST /api/v1/nanobanana/generate-2` */
export const NANO_BANANA_2_ASPECT_RATIOS = [
  "auto",
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type NanoBanana2AspectRatio = (typeof NANO_BANANA_2_ASPECT_RATIOS)[number];
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

export function coerceNanoBanana2AspectRatio(aspect: string | undefined): NanoBanana2AspectRatio {
  const v = (aspect ?? "auto").trim();
  if ((NANO_BANANA_2_ASPECT_RATIOS as readonly string[]).includes(v)) {
    return v as NanoBanana2AspectRatio;
  }
  return "auto";
}

type NanoBanana2GenerateResponse =
  | { code: 200; message: string; data: { taskId: string } }
  | { code: number; message: string; data?: unknown };

/** NanoBanana 2 — text/image with 1K/2K/4K resolution (replaces legacy `/generate` for studio “nano”). */
export async function nanoBananaGenerate2(req: {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string;
  resolution?: NanoBananaProResolution;
  callBackUrl?: string;
  outputFormat?: "png" | "jpg";
  googleSearch?: boolean;
}) {
  const apiKey = requireEnv("NANOBANANA_API_KEY");

  const res = await fetch(`${API_BASE}/api/v1/nanobanana/generate-2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: req.prompt,
      imageUrls: req.imageUrls?.length ? req.imageUrls : [],
      aspectRatio: coerceNanoBanana2AspectRatio(req.aspectRatio),
      resolution: req.resolution ?? "1K",
      callBackUrl: req.callBackUrl,
      outputFormat: req.outputFormat ?? "jpg",
      googleSearch: req.googleSearch ?? false,
    }),
    cache: "no-store",
  });

  const json = (await res.json()) as NanoBanana2GenerateResponse & { msg?: string };
  const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data?.taskId;

  if (!res.ok || json.code !== 200 || typeof taskId !== "string") {
    const code = (json as unknown as { code?: unknown })?.code;
    const msg =
      (json as { message?: string; msg?: string }).message ??
      json.msg ??
      `HTTP ${res.status}`;
    throw new Error(
      `NanoBanana generate-2 failed: HTTP ${res.status} / code ${String(code)} / ${String(msg)}`,
    );
  }

  return taskId;
}

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
          // Some responses use `resultUrls` instead.
          resultUrls?: string[];
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
      resultUrls?: string[];
    };
  };
}

