import { requireEnv } from "@/lib/env";

const API_BASE = "https://api.kie.ai";

function getKieApiKey() {
  return requireEnv("KIE_API_KEY");
}

export type KieMarketCreateTaskRequest = {
  model: string;
  callBackUrl?: string;
  input?: unknown;
};

type KieMarketCreateTaskResponse =
  | { code: 200; msg: string; data: { taskId: string } }
  | { code: number; msg: string; data?: unknown };

export async function kieMarketCreateTask(req: KieMarketCreateTaskRequest, overrideApiKey?: string) {
  const apiKey = overrideApiKey || getKieApiKey();

  async function attempt() {
    const res = await fetch(`${API_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
      cache: "no-store",
    });

    const json = (await res.json()) as KieMarketCreateTaskResponse;
    const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data
      ?.taskId;

    return { res, json, taskId };
  }

  const first = await attempt();

  // KIE sometimes returns HTTP 200 with code=500 "Server exception" transiently.
  if (
    first.res.ok &&
    first.json.code === 500 &&
    typeof first.json.msg === "string" &&
    first.json.msg.toLowerCase().includes("server exception")
  ) {
    await new Promise((r) => setTimeout(r, 800));
    const second = await attempt();
    if (second.res.ok && second.json.code === 200 && typeof second.taskId === "string") {
      return second.taskId;
    }
    throw new Error(
      `KIE createTask failed: HTTP ${second.res.status} / code ${second.json.code} / ${second.json.msg}`,
    );
  }

  if (!first.res.ok || first.json.code !== 200 || typeof first.taskId !== "string") {
    throw new Error(
      `KIE createTask failed: HTTP ${first.res.status} / code ${first.json.code} / ${first.json.msg}`,
    );
  }

  return first.taskId;
}

export type KieMarketRecordInfo = {
  taskId: string;
  model: string;
  state: "waiting" | "queuing" | "generating" | "success" | "fail" | string;
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  progress?: number;
};

type KieMarketRecordInfoResponse =
  | { code: 200; message: string; data: KieMarketRecordInfo }
  | { code: number; message: string; data?: unknown };

export async function kieMarketRecordInfo(taskId: string, overrideApiKey?: string) {
  const apiKey = overrideApiKey || getKieApiKey();

  const url = new URL(`${API_BASE}/api/v1/jobs/recordInfo`);
  url.searchParams.set("taskId", taskId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  const json = (await res.json()) as KieMarketRecordInfoResponse;

  if (!res.ok || json.code !== 200 || !(json as any).data) {
    const msg = (json as any).message ?? `HTTP ${res.status}`;
    throw new Error(`KIE recordInfo failed: ${String(msg)}`);
  }

  return (json as Extract<KieMarketRecordInfoResponse, { code: 200 }>).data;
}

export function parseResultUrls(resultJson: string | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: unknown };
    const urls = (parsed as any)?.resultUrls;
    if (!Array.isArray(urls)) return [];
    return urls.filter((u) => typeof u === "string" && u.length > 0);
  } catch {
    return [];
  }
}

/** Fallback when `resultUrls` is missing — walk JSON for https URLs (image/video). */
export function parseKieResultMediaUrls(resultJson: string | undefined): string[] {
  const direct = parseResultUrls(resultJson);
  if (direct.length > 0) return direct;
  if (!resultJson) return [];
  try {
    const o = JSON.parse(resultJson) as unknown;
    const out: string[] = [];
    function walk(x: unknown): void {
      if (typeof x === "string" && /^https?:\/\//i.test(x)) out.push(x);
      else if (Array.isArray(x)) for (const i of x) walk(i);
      else if (x && typeof x === "object") for (const v of Object.values(x)) walk(v);
    }
    walk(o);
    return [...new Set(out)];
  } catch {
    return [];
  }
}

