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

  /** KIE often returns HTTP 200 with code=500 ("internal error", "Server exception", etc.) — retry with backoff. */
  const maxAttempts = 4;
  const backoffBeforeAttemptMs = [0, 700, 1500, 2800];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (backoffBeforeAttemptMs[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, backoffBeforeAttemptMs[attempt]));
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
        cache: "no-store",
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1) continue;
      throw lastError;
    }

    let json: KieMarketCreateTaskResponse;
    try {
      json = (await res.json()) as KieMarketCreateTaskResponse;
    } catch {
      lastError = new Error(`Generation request returned invalid JSON (HTTP ${res.status})`);
      if (attempt < maxAttempts - 1) continue;
      throw lastError;
    }

    const taskId = (json as unknown as { data?: { taskId?: unknown } })?.data?.taskId;
    const msg = typeof json.msg === "string" ? json.msg : "";
    const code = json.code;

    if (res.ok && code === 200 && typeof taskId === "string") {
      return taskId;
    }

    const msgLc = msg.toLowerCase();
    const retryable =
      (res.ok && (code === 500 || code === 502 || code === 503)) ||
      (!res.ok && (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504)) ||
      /server exception|internal error|temporar|timeout|try again|busy|overload|rate limit|gateway|bad gateway/i.test(
        msgLc,
      );

    lastError = new Error(`Generation request failed: HTTP ${res.status} / code ${code} / ${msg}`);

    if (retryable && attempt < maxAttempts - 1) {
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error("Generation request failed after retries.");
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

  /** Polling hits recordInfo often; transient network / gateway failures must not abort the whole run. */
  const maxAttempts = 5;
  const backoffBeforeAttemptMs = [0, 250, 600, 1200, 2200];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (backoffBeforeAttemptMs[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, backoffBeforeAttemptMs[attempt]));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1) continue;
      throw lastError;
    }

    let json: KieMarketRecordInfoResponse;
    try {
      json = (await res.json()) as KieMarketRecordInfoResponse;
    } catch {
      lastError = new Error(`Task status response was not JSON (HTTP ${res.status})`);
      if (attempt < maxAttempts - 1) continue;
      throw lastError;
    }

    const msg = String((json as { message?: unknown }).message ?? "");
    const code = (json as { code?: unknown }).code;
    const okData = res.ok && code === 200 && (json as { data?: unknown }).data;

    if (okData) {
      const raw = (json as Extract<KieMarketRecordInfoResponse, { code: 200 }>).data;
      const d = raw as Record<string, unknown>;
      const mergedState = String(d.state ?? d.status ?? "").trim() || "unknown";
      return { ...(raw as object), state: mergedState } as KieMarketRecordInfo;
    }

    const retryableHttp = !res.ok && (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504);
    const retryableCode = code === 502 || code === 503 || code === 504 || code === 500;
    const retryableMsg = /timeout|temporar|try again|gateway|rate|busy|overload|fetch failed|network|econnreset/i.test(
      msg,
    );

    lastError = new Error(`Task status check failed: ${msg || `HTTP ${res.status}`}`);

    if ((retryableHttp || retryableCode || retryableMsg) && attempt < maxAttempts - 1) {
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error("Task status check failed after retries.");
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

