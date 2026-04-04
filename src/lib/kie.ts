import { getEnv, requireEnv } from "@/lib/env";

const API_BASE = "https://api.kie.ai";

function getKieApiKey() {
  // Backwards-compatible with your existing env var.
  return getEnv("KIE_API_KEY") ?? requireEnv("VEO3_API_KEY");
}

export type KieVeoModel = "veo3" | "veo3_fast";
export type KieVeoAspectRatio = "16:9" | "9:16" | "Auto";
export type KieVeoGenerationType =
  | "TEXT_2_VIDEO"
  | "FIRST_AND_LAST_FRAMES_2_VIDEO"
  | "REFERENCE_2_VIDEO";

export type KieVeoGenerateRequest = {
  prompt: string;
  model: KieVeoModel;
  aspect_ratio?: KieVeoAspectRatio;
  generationType?: KieVeoGenerationType;
  imageUrls?: string[];
  callBackUrl?: string;
  enableTranslation?: boolean;
  watermark?: string;
  seeds?: number;
};

type KieVeoGenerateResponse =
  | { code: 200; msg: string; data: { taskId: string } }
  | { code: number; msg: string; data?: unknown };

export async function kieVeoGenerate(req: KieVeoGenerateRequest, overrideApiKey?: string) {
  const apiKey = overrideApiKey?.trim() || getKieApiKey();

  const res = await fetch(`${API_BASE}/api/v1/veo/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    cache: "no-store",
  });

  const json = (await res.json()) as KieVeoGenerateResponse;
  const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data
    ?.taskId;

  if (!res.ok || json.code !== 200 || typeof taskId !== "string") {
    throw new Error(
      `Video generation failed: HTTP ${res.status} / code ${json.code} / ${json.msg}`,
    );
  }

  return taskId;
}

export type KieVeoRecordInfo =
  | {
      code: 200;
      msg: string;
      data: {
        taskId: string;
        successFlag: 0 | 1 | 2 | 3;
        errorCode?: number | null;
        errorMessage?: string | null;
        response?: {
          taskId?: string;
          resultUrls?: string[];
          originUrls?: string[];
          resolution?: string;
        };
      };
    }
  | { code: number; msg: string; data?: unknown };

export async function kieVeoRecordInfo(taskId: string, overrideApiKey?: string) {
  const apiKey = overrideApiKey?.trim() || getKieApiKey();

  const url = new URL(`${API_BASE}/api/v1/veo/record-info`);
  url.searchParams.set("taskId", taskId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const json = (await res.json()) as KieVeoRecordInfo;
  const data = (json as unknown as { data?: unknown })?.data as
    | { successFlag?: unknown }
    | undefined;

  if (!res.ok || json.code !== 200 || typeof data?.successFlag !== "number") {
    throw new Error(
      `Video status check failed: HTTP ${res.status} / code ${json.code} / ${json.msg}`,
    );
  }

  return (json as Extract<KieVeoRecordInfo, { code: 200 }>).data;
}

