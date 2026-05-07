/**
 * Client-side Kling/KIE Market polling + immediate DB persist.
 * Server poll still runs as a backup; this matches completed jobs to the row quickly (same pattern as Studio Video).
 *
 * Resilience contract — see also `/api/kling/status`, `/api/kie/veo/status`,
 * `/api/nanobanana/task`, `pollNanoBananaTask` (workflow):
 *   - We never throw on transient provider errors (rate-limit / 429-504 / network blips
 *     / "frequency too high"). We just keep polling, because the underlying generation
 *     is almost always still completing fine server-side.
 *   - EXCEPTION: when the task itself is reported `FAILED` with a "high demand" /
 *     "Service is currently unavailable. (E003)" message, the task is permanently
 *     dead on the provider — we surface the error so the outer job wrapper can
 *     re-submit a fresh task instead of polling indefinitely (which is how we used
 *     to OOM the Vercel runtime on a 100-prompt batch).
 *   - We use exponential-ish backoff with jitter so 100 parallel jobs don't lock-step
 *     into the same poll instants and bomb the upstream provider.
 *   - We grow the per-job total wait budget so longer (Sora 2 Pro / Veo 3 / Seedance)
 *     jobs don't time out client-side while the provider is still working.
 */
import { isTaskTerminallyDeadButRetryable } from "@/lib/providerTransientError";

const POLL_BASE_INTERVAL_MS = 4_000;
const POLL_MAX_INTERVAL_MS = 12_000;
const POLL_JITTER = 0.25;
/** ~16 minutes total budget at avg 8s spacing — comfortably above Sora 2 Pro / Veo 3 worst case. */
const POLL_MAX_ROUNDS = 120;

/** Avoid hung status requests leaving the Studio UI stuck on "generating" forever. */
const STATUS_FETCH_TIMEOUT_MS = 45_000;

function isTransientPollErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("abort") ||
    m.includes("aborted") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("econnreset") ||
    m.includes("und_err_socket") ||
    m.includes("socketerror") ||
    m.includes("other side closed") ||
    m.includes("network") ||
    m.includes("call frequency") ||
    m.includes("frequency is too high") ||
    m.includes("rate limit") ||
    m.includes("ratelimit") ||
    m.includes("throttl") ||
    m.includes("too many requests") ||
    m.includes("try again later") ||
    m.includes("temporar") ||
    m.includes("server exception") ||
    m.includes("internal error") ||
    m.includes("service unavailable") ||
    m.includes("bad gateway") ||
    m.includes("gateway time")
  );
}

function pollDelayMs(attempt: number, consecutiveTransient: number): number {
  const grow = Math.min(
    POLL_MAX_INTERVAL_MS,
    POLL_BASE_INTERVAL_MS + Math.max(0, attempt) * 200 + Math.max(0, consecutiveTransient) * 600,
  );
  const jitter = grow * POLL_JITTER;
  return Math.max(2_000, Math.floor(grow + (Math.random() * 2 - 1) * jitter));
}

async function fetchStatusWithTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), STATUS_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

type KlingStatusJson = {
  data?: {
    status?: string;
    response?: string[];
    error_message?: string | null;
  };
  error?: string;
};

async function readKlingStatusResponse(res: Response): Promise<KlingStatusJson> {
  const text = await res.text();
  if (!text.trim()) {
    return res.ok ? {} : { error: `Empty response (HTTP ${res.status})` };
  }
  try {
    return JSON.parse(text) as KlingStatusJson;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      res.ok
        ? `Invalid JSON from status endpoint: ${snippet}`
        : `Status error (HTTP ${res.status}): ${snippet}`,
    );
  }
}

export async function completeStudioTask(taskId: string, resultUrl: string): Promise<void> {
  try {
    const res = await fetch("/api/studio/generations/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, resultUrl }),
    });
    if (!res.ok) {
      console.error("[completeStudioTask] server returned", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[completeStudioTask] network error", err);
  }
}

export async function pollKlingVideo(
  taskId: string,
  personalApiKey?: string,
  piapiApiKey?: string,
  opts?: { maxRounds?: number; timeoutMessage?: string },
): Promise<string> {
  const p = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  const pi = piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : "";
  const keyParam = `${p}${pi}`;
  const maxRounds = Math.max(1, Math.floor(opts?.maxRounds ?? POLL_MAX_ROUNDS));
  // Desynchronize parallel job starts (100 jobs launched in the same millisecond
  // would otherwise lock-step into the same poll instants and bomb Kie / PiAPI).
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1500)));
  let consecutiveTransient = 0;
  for (let i = 0; i < maxRounds; i++) {
    let res: Response;
    let json: KlingStatusJson;
    try {
      res = await fetchStatusWithTimeout(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`);
      json = await readKlingStatusResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (isTransientPollErrorMessage(msg)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw err instanceof Error ? err : new Error(msg || "Video status check failed.");
    }
    if (!res.ok) {
      const message = json.error || `Video status check failed (HTTP ${res.status}).`;
      if (
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        isTransientPollErrorMessage(message)
      ) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw new Error(message);
    }
    consecutiveTransient = 0;
    const st = String(json.data?.status ?? "").toUpperCase();
    if (st === "SUCCESS") {
      const list = json.data?.response ?? [];
      const u = list.map((x) => String(x).trim()).find((s) => s.length > 0);
      if (u) return u;
      await new Promise((r) => setTimeout(r, pollDelayMs(i, 0)));
      continue;
    }
    if (st === "FAILED") {
      const errMsg = json.data?.error_message?.trim() ?? "";
      // Kie market overload: task is terminally dead, surface so the outer job
      // wrapper can re-submit a fresh task with backoff. Don't keep polling.
      if (errMsg && isTaskTerminallyDeadButRetryable(errMsg)) {
        throw new Error(errMsg);
      }
      // Some providers emit transient-shaped messages on the FAILED envelope while the
      // task is still actually running. Treat those as pending instead of aborting.
      if (errMsg && isTransientPollErrorMessage(errMsg)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw new Error(errMsg || "Video generation failed.");
    }
    const inFlight = new Set([
      "",
      "IN_PROGRESS",
      "PENDING",
      "PROCESSING",
      "QUEUED",
      "WAITING",
      "RUNNING",
      /** Rare provider / proxy variants — keep polling instead of failing the Studio job. */
      "COMPLETED",
      "COMPLETE",
      "SUCCEEDED",
      "DONE",
    ]);
    if (st && !inFlight.has(st)) {
      throw new Error(
        json.data?.error_message?.trim() || `Video task stopped with status: ${json.data?.status ?? st}`,
      );
    }
    await new Promise((r) => setTimeout(r, pollDelayMs(i, 0)));
  }
  throw new Error(opts?.timeoutMessage || "Video generation timed out. Please try again.");
}

type VeoStatusJson = {
  data?: { successFlag?: number; errorMessage?: string | null; response?: { resultUrls?: string[] } };
  error?: string;
};

async function readVeoStatusResponse(res: Response): Promise<VeoStatusJson> {
  const text = await res.text();
  if (!text.trim()) {
    return res.ok ? {} : { error: `Empty response (HTTP ${res.status})` };
  }
  try {
    return JSON.parse(text) as VeoStatusJson;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      res.ok
        ? `Invalid JSON from Veo status: ${snippet}`
        : `Veo status error (HTTP ${res.status}): ${snippet}`,
    );
  }
}

/** Client-side Veo status polling (same pattern as {@link pollKlingVideo}). */
export async function pollVeoVideo(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  // Same start-jitter as pollKlingVideo to spread parallel polls across providers.
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1500)));
  let consecutiveTransient = 0;
  for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
    let res: Response;
    let json: VeoStatusJson;
    try {
      res = await fetchStatusWithTimeout(`/api/kie/veo/status?taskId=${encodeURIComponent(taskId)}${keyParam}`);
      json = await readVeoStatusResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (isTransientPollErrorMessage(msg)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw err instanceof Error ? err : new Error(msg || "Veo status check failed.");
    }
    if (!res.ok) {
      const message = json.error || `Veo status check failed (HTTP ${res.status}).`;
      if (
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        isTransientPollErrorMessage(message)
      ) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw new Error(message);
    }
    consecutiveTransient = 0;
    const d = json.data;
    if (!d) {
      // Transient-tolerant: the route may have returned an empty body during a blip.
      await new Promise((r) => setTimeout(r, pollDelayMs(i, 0)));
      continue;
    }
    if (d.successFlag === 1) {
      const u = d.response?.resultUrls?.[0];
      if (!u) throw new Error("No video URL in completed Veo task.");
      return u;
    }
    if (d.successFlag === 2 || d.successFlag === 3) {
      const errMsg = d.errorMessage?.trim() ?? "";
      // Kie market overload — the task is dead, propagate so outer wrapper retries.
      if (errMsg && isTaskTerminallyDeadButRetryable(errMsg)) {
        throw new Error(errMsg);
      }
      if (errMsg && isTransientPollErrorMessage(errMsg)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, pollDelayMs(i, consecutiveTransient)));
        continue;
      }
      throw new Error(errMsg || "Veo generation failed.");
    }
    await new Promise((r) => setTimeout(r, pollDelayMs(i, 0)));
  }
  throw new Error("Veo generation timed out. Please try again.");
}
