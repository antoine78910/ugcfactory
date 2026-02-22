import { requireEnv } from "@/lib/env";

const API_BASE = "https://kling3api.com";

export type KlingAspectRatio = "16:9" | "9:16" | "1:1";

export type KlingGenerateBody = {
  type: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: KlingAspectRatio;
  image?: string;
  end_image?: string;
  sound?: boolean;
  negative_prompt?: string;
  cfg_scale?: number;
};

type KlingGenerateResponse =
  | {
      code: 200;
      message: string;
      data: { task_id: string; status: string; consumed_credits?: number };
    }
  | { code: number; message: string; data?: unknown };

export async function klingGenerate(body: KlingGenerateBody) {
  const apiKey = requireEnv("KLING3_API_KEY");

  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json()) as KlingGenerateResponse;
  const taskId = (json as unknown as { data?: { task_id?: unknown } })?.data
    ?.task_id;

  if (!res.ok || json.code !== 200 || typeof taskId !== "string") {
    const msg =
      (json as unknown as { message?: unknown })?.message ??
      `HTTP ${res.status}`;
    throw new Error(`Kling generate failed: ${String(msg)}`);
  }

  return taskId;
}

type KlingStatusResponse =
  | {
      code: 200;
      message: string;
      data: KlingStatusData;
    }
  | { code: number; message: string; data?: unknown };

export type KlingStatusData = {
  task_id: string;
  status: "IN_PROGRESS" | "SUCCESS" | "FAILED" | string;
  response?: string[];
  error_message?: string | null;
  consumed_credits?: number;
  created_at?: string;
  type?: string;
};

export async function klingGetStatus(taskId: string) {
  const apiKey = requireEnv("KLING3_API_KEY");

  const url = new URL(`${API_BASE}/api/status`);
  url.searchParams.set("task_id", taskId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const json = (await res.json()) as KlingStatusResponse;

  const data = (json as unknown as { data?: unknown })?.data as
    | { status?: unknown }
    | undefined;

  if (!res.ok || json.code !== 200 || typeof data?.status !== "string") {
    const msg =
      (json as unknown as { message?: unknown })?.message ??
      `HTTP ${res.status}`;
    throw new Error(`Kling status failed: ${String(msg)}`);
  }

  return (json as { data: KlingStatusData }).data;
}

