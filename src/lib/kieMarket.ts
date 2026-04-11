import { requireEnv } from "@/lib/env";
import { walkJsonForHttpsUrls } from "@/lib/walkJsonForHttpsUrls";

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
    s === "successful" ||
    s === "completed" ||
    s === "complete" ||
    s === "succeed" ||
    s === "done" ||
    s === "finished" ||
    s === "ok" ||
    s === "ready"
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

function jsonStringifySafe(v: unknown): string | undefined {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return undefined;
  }
}

/**
 * KIE Market `recordInfo` payloads differ by model (Kling, etc.): `resultJson` may be missing,
 * live under `result` / `data`, or use snake_case. Normalize before polling logic runs.
 */
export function normalizeKieMarketRecordData(raw: Record<string, unknown>): KieMarketRecordInfo {
  const state = String(raw.state ?? raw.status ?? "").trim() || "unknown";

  let resultJson: string | undefined;
  const rj = raw.resultJson ?? raw.result_json;
  if (typeof rj === "string" && rj.trim()) {
    resultJson = rj.trim();
  } else if (rj !== null && typeof rj === "object") {
    resultJson = jsonStringifySafe(rj);
  }

  if (!resultJson?.trim()) {
    const nested = raw.result ?? raw.output ?? raw.outputs ?? raw.response ?? raw.data;
    if (typeof nested === "string" && nested.trim()) {
      resultJson = nested.trim();
    } else if (nested !== null && typeof nested === "object") {
      resultJson = jsonStringifySafe(nested);
    }
  }

  if (!resultJson?.trim()) {
    const bag: Record<string, unknown> = {};
    for (const k of [
      "result",
      "output",
      "outputs",
      "response",
      "data",
      "videoUrl",
      "video_url",
      "url",
      "downloadUrl",
      "download_url",
      "fileUrl",
      "file_url",
      "mediaUrl",
      "media_url",
    ]) {
      if (raw[k] !== undefined) bag[k] = raw[k];
    }
    if (Object.keys(bag).length > 0) {
      resultJson = jsonStringifySafe(bag);
    }
  }

  const failMsg =
    (typeof raw.failMsg === "string" && raw.failMsg.trim()) ||
    (typeof raw.fail_msg === "string" && raw.fail_msg.trim()) ||
    (typeof raw.message === "string" && raw.message.trim() && kieRecordStateIsFail(state)
      ? raw.message.trim()
      : undefined) ||
    (typeof raw.error === "string" && raw.error.trim() ? raw.error.trim() : undefined);

  const failCode =
    typeof raw.failCode === "string"
      ? raw.failCode
      : typeof raw.fail_code === "string"
        ? raw.fail_code
        : undefined;

  const base = { ...raw, state, resultJson, failMsg, failCode } as KieMarketRecordInfo;
  return base;
}

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
      return normalizeKieMarketRecordData(raw as Record<string, unknown>);
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
    const data = (parsed.data as Record<string, unknown> | undefined) ?? undefined;
    const resultObj = (parsed.result as Record<string, unknown> | undefined) ?? undefined;
    const arrays = [
      parsed.resultUrls,
      parsed.result_urls,
      parsed.resultList,
      parsed.outputList,
      parsed.videoList,
      parsed.mediaUrls,
      parsed.media_urls,
      parsed.files,
      data?.resultUrls,
      data?.result_urls,
      data?.urls,
      data?.outputs,
      resultObj?.urls,
      resultObj?.resultUrls,
      parsed.outputUrls,
      parsed.output_urls,
      parsed.videoUrls,
      parsed.video_urls,
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
      parsed.outputUrl,
      parsed.output_url,
      parsed.videoUrl,
      parsed.video_url,
      data?.resultUrl,
      data?.videoUrl,
      data?.url,
      resultObj?.url,
      resultObj?.videoUrl,
      resultObj?.video_url,
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
export function parseKieResultMediaUrls(
  resultJson: string | Record<string, unknown> | undefined | null,
): string[] {
  if (resultJson == null) return [];
  const asString =
    typeof resultJson === "string"
      ? resultJson
      : (() => {
          try {
            return JSON.stringify(resultJson);
          } catch {
            return "";
          }
        })();
  const direct = parseResultUrls(asString || undefined);
  if (direct.length > 0) return direct;
  if (!asString) return [];
  try {
    const o = JSON.parse(asString) as unknown;
    return walkJsonForHttpsUrls(o);
  } catch {
    return [];
  }
}

/** Use after {@link normalizeKieMarketRecordData}: structured fields + full-record walk. */
export function extractKieMediaUrls(data: KieMarketRecordInfo): string[] {
  const fromJson = parseKieResultMediaUrls(data.resultJson);
  if (fromJson.length > 0) return fromJson;
  return walkJsonForHttpsUrls(data as unknown as Record<string, unknown>);
}

