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
    s === "failure" ||
    s === "error" ||
    s === "internal_error" ||
    s === "internal error" ||
    s === "cancelled" ||
    s === "canceled"
  );
}

type KieMarketRecordInfoResponse =
  | { code: 200; msg: string; data: KieMarketRecordInfo }
  | { code: number; msg: string; data?: unknown | null };

function jsonStringifySafe(v: unknown): string | undefined {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return undefined;
  }
}

/**
 * KIE Market OpenAPI uses `msg` on the envelope (see get-task-detail / recordInfo).
 * https://docs.kie.ai/market/common/get-task-detail
 */
export function kieMarketApiEnvelopeMsg(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const o = json as Record<string, unknown>;
  const primary = o.msg;
  const alt = o.message;
  const s =
    typeof primary === "string"
      ? primary
      : typeof alt === "string"
        ? alt
        : "";
  return s.trim();
}

function kieMarketApiEnvelopeCode(json: unknown): number | undefined {
  if (!json || typeof json !== "object") return undefined;
  const c = (json as Record<string, unknown>).code;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (typeof c === "string" && /^\d+$/.test(c.trim())) return Number(c.trim());
  return undefined;
}

/**
 * recordInfo API codes that must fail immediately (no backoff loop).
 * @see https://docs.kie.ai/market/common/get-task-detail
 */
const KIE_RECORD_INFO_TERMINAL_CODES = new Set([
  401, // Unauthorized
  402, // Insufficient credits
  404, // Task not found
  408, // Upstream: no result for extended period
  422, // Validation / e.g. recordInfo is null
  455, // Maintenance
  501, // Generation failed
  505, // Feature disabled
]);

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

  /**
   * Polling calls this every few seconds. KIE often returns HTTP 200 with `code: 500` + `msg` for
   * server-side failures — retrying that 5× per poll hid errors and looked like infinite loading.
   * Terminal envelope codes fail immediately; only true transient cases retry (short cap).
   */
  const maxAttempts = 3;
  const backoffBeforeAttemptMs = [0, 400, 900];
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

    const msg = kieMarketApiEnvelopeMsg(json);
    const code = kieMarketApiEnvelopeCode(json);
    const data = (json as { data?: unknown }).data;

    /**
     * `recordInfo` usually returns `data` as an object, but some jobs (notably image upscale) may
     * return the result URL as a plain string or a URL array. Those were previously treated as
     * failures (infinite "generating" in Studio) because we only accepted non-array objects.
     */
    if (res.ok && code === 200 && data != null) {
      if (typeof data === "string") {
        const t = data.trim();
        if (/^https?:\/\//i.test(t)) {
          return normalizeKieMarketRecordData({ state: "success", resultJson: t });
        }
        if (t.startsWith("//")) {
          return normalizeKieMarketRecordData({ state: "success", resultJson: `https:${t}` });
        }
      }
      if (Array.isArray(data)) {
        const merged = urlsFromMixedArray(data);
        if (merged.length > 0) {
          return normalizeKieMarketRecordData({
            state: "success",
            resultJson: JSON.stringify({ resultUrls: merged }),
          });
        }
      }
    }

    const okData =
      res.ok && code === 200 && data != null && typeof data === "object" && !Array.isArray(data);

    if (okData) {
      const raw = data as Record<string, unknown>;
      return normalizeKieMarketRecordData(raw);
    }

    if (code != null && KIE_RECORD_INFO_TERMINAL_CODES.has(code)) {
      throw new Error(msg || `Video task status failed (KIE code ${code}).`);
    }

    const retryableHttp = !res.ok && (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504);
    /** JSON `code` 500 = server error per KIE docs — retry at most once (this loop), then surface. */
    const retryableCode =
      code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
    const retryableMsg = /timeout|temporar|try again|gateway|rate|busy|overload|fetch failed|network|econnreset|internal error|server error|server exception/i.test(
      msg,
    );

    lastError = new Error(
      msg
        ? msg
        : `Task status check failed (HTTP ${res.status}${code != null ? `, KIE code ${code}` : ""}).`,
    );

    if ((retryableHttp || retryableCode || retryableMsg) && attempt < maxAttempts - 1) {
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error("Task status check failed after retries.");
}

function tryParseJsonString(s: string): unknown | null {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/**
 * Kling 3.0 (multi-shot) and some Market models return `resultUrls` / `shots` as an array of objects
 * (`{ url, video_url, … }`) or nest JSON as a string; plain `filter(string)` then misses URLs and
 * polling stays IN_PROGRESS forever despite `state: success`.
 */
function urlsFromMixedArray(arr: readonly unknown[]): string[] {
  const out: string[] = [];
  const objectKeys = [
    "url",
    "videoUrl",
    "video_url",
    "uri",
    "src",
    "fileUrl",
    "file_url",
    "outputUrl",
    "output_url",
    "downloadUrl",
    "download_url",
    "mediaUrl",
    "media_url",
  ] as const;
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) {
      out.push(x.trim());
      continue;
    }
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as Record<string, unknown>;
      for (const k of objectKeys) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) {
          out.push(v.trim());
          break;
        }
      }
    }
  }
  return out;
}

function extractUrlsFromParsedJsonValue(parsed: unknown): string[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    const mixed = urlsFromMixedArray(parsed);
    return mixed.length > 0 ? mixed : [];
  }
  if (typeof parsed !== "object") return [];
  const parsedRecord = parsed as Record<string, unknown>;
  const data = (parsedRecord.data as Record<string, unknown> | undefined) ?? undefined;
  const resultObj = (parsedRecord.result as Record<string, unknown> | undefined) ?? undefined;
  const arrays = [
    parsedRecord.resultUrls,
    parsedRecord.result_urls,
    parsedRecord.resultList,
    parsedRecord.outputList,
    parsedRecord.videoList,
    parsedRecord.mediaUrls,
    parsedRecord.media_urls,
    parsedRecord.files,
    parsedRecord.shots,
    parsedRecord.clips,
    parsedRecord.segments,
    parsedRecord.outputs,
    data?.resultUrls,
    data?.result_urls,
    data?.urls,
    data?.outputs,
    data?.videos,
    data?.shots,
    resultObj?.urls,
    resultObj?.resultUrls,
    resultObj?.videos,
    parsedRecord.outputUrls,
    parsedRecord.output_urls,
    parsedRecord.videoUrls,
    parsedRecord.video_urls,
    parsedRecord.imageUrls,
    parsedRecord.images,
    parsedRecord.urls,
  ];
  for (const urls of arrays) {
    if (!Array.isArray(urls)) continue;
    const strs = urls.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (strs.length > 0) return strs;
    const mixed = urlsFromMixedArray(urls as unknown[]);
    if (mixed.length > 0) return mixed;
  }
  const single = [
    parsedRecord.resultImageUrl,
    parsedRecord.resultUrl,
    parsedRecord.result_url,
    parsedRecord.outputUrl,
    parsedRecord.output_url,
    parsedRecord.outputImageUrl,
    parsedRecord.output_image_url,
    parsedRecord.upscaledUrl,
    parsedRecord.upscaled_url,
    parsedRecord.videoUrl,
    parsedRecord.video_url,
    data?.resultUrl,
    data?.videoUrl,
    data?.url,
    resultObj?.url,
    resultObj?.videoUrl,
    resultObj?.video_url,
    parsedRecord.image_url,
    parsedRecord.imageUrl,
    parsedRecord.url,
  ].find((v) => typeof v === "string" && v.length > 0);
  if (typeof single === "string") return [single];
  return [];
}

export function parseResultUrls(resultJson: string | undefined): string[] {
  if (!resultJson?.trim()) return [];
  let s = resultJson.trim();
  for (let depth = 0; depth < 5; depth++) {
    const v = tryParseJsonString(s);
    if (v == null) return [];
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return [];
      if (t.startsWith("{") || t.startsWith("[")) {
        s = t;
        continue;
      }
      if (/^https?:\/\//i.test(t)) return [t];
      if (t.startsWith("//")) return [`https:${t}`];
      return [];
    }
    return extractUrlsFromParsedJsonValue(v);
  }
  return [];
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
  if (!asString.trim()) return [];
  try {
    let s = asString.trim();
    for (let d = 0; d < 5; d++) {
      const v = JSON.parse(s) as unknown;
      if (typeof v === "string") {
        const t = v.trim();
        if ((t.startsWith("{") || t.startsWith("[")) && t.length > 1) {
          s = t;
          continue;
        }
        const w = walkJsonForHttpsUrls(v);
        return w.length > 0 ? w : [];
      }
      return walkJsonForHttpsUrls(v);
    }
  } catch {
    return [];
  }
  return [];
}

/** Use after {@link normalizeKieMarketRecordData}: structured fields + full-record walk. */
export function extractKieMediaUrls(data: KieMarketRecordInfo): string[] {
  const fromJson = parseKieResultMediaUrls(data.resultJson);
  if (fromJson.length > 0) return fromJson;
  return walkJsonForHttpsUrls(data as unknown as Record<string, unknown>);
}

