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

/** Kie `recordInfo` sometimes uses `status` instead of `state`, and success synonyms vary by model. */
export function kieRecordStateIsSuccess(state: string | undefined): boolean {
  const s = String(state ?? "").toLowerCase().trim();
  return (
    s === "success" ||
    s === "completed" ||
    s === "complete" ||
    s === "succeed" ||
    s === "done" ||
    s === "finished"
  );
}

export function kieRecordStateIsFail(state: string | undefined): boolean {
  const s = String(state ?? "").toLowerCase().trim();
  return (
    s === "fail" ||
    s === "failed" ||
    s === "error" ||
    s === "cancelled" ||
    s === "canceled"
  );
}

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

  const raw = (json as Extract<KieMarketRecordInfoResponse, { code: 200 }>).data;
  const d = raw as Record<string, unknown>;
  const mergedState = String(d.state ?? d.status ?? "").trim() || "unknown";
  return { ...(raw as object), state: mergedState } as KieMarketRecordInfo;
}

export function parseResultUrls(resultJson: string | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    const arrays = [
      parsed.resultUrls,
      parsed.result_urls,
      (parsed.data as Record<string, unknown> | undefined)?.resultUrls,
      parsed.imageUrls,
      parsed.images,
      parsed.urls,
    ];
    for (const urls of arrays) {
      if (Array.isArray(urls)) {
        const u = urls.filter((x): x is string => typeof x === "string" && x.length > 0);
        if (u.length > 0) return u;
      }
    }
    const single = [
      parsed.resultImageUrl,
      parsed.resultUrl,
      parsed.result_url,
      parsed.image_url,
      parsed.imageUrl,
      parsed.url,
    ].find((v) => typeof v === "string" && v.length > 0);
    if (typeof single === "string") return [single];
    return [];
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
      if (typeof x === "string") {
        if (/^https?:\/\//i.test(x)) out.push(x);
        else if (x.startsWith("//")) out.push(`https:${x}`);
      }
      else if (Array.isArray(x)) for (const i of x) walk(i);
      else if (x && typeof x === "object") for (const v of Object.values(x)) walk(v);
    }
    walk(o);
    return [...new Set(out)];
  } catch {
    return [];
  }
}

