/**
 * Client-side Kling/KIE Market polling + immediate DB persist.
 * Server poll still runs as a backup; this matches completed jobs to the row quickly (same pattern as Studio Video).
 */

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ROUNDS = 120;
/** Avoid hung status requests leaving the Studio UI stuck on "generating" forever. */
const STATUS_FETCH_TIMEOUT_MS = 45_000;

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
): Promise<string> {
  const p = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  const pi = piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : "";
  const keyParam = `${p}${pi}`;
  for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
    const res = await fetchStatusWithTimeout(
      `/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`,
    );
    const json = await readKlingStatusResponse(res);
    if (!res.ok) {
      throw new Error(json.error || `Video status check failed (HTTP ${res.status}).`);
    }
    const st = String(json.data?.status ?? "").toUpperCase();
    if (st === "SUCCESS") {
      const list = json.data?.response ?? [];
      const u = list.map((x) => String(x).trim()).find((s) => s.length > 0);
      if (u) return u;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    if (st === "FAILED") {
      throw new Error(json.data?.error_message?.trim() || "Video generation failed.");
    }
    const inFlight = new Set(["", "IN_PROGRESS", "PENDING", "PROCESSING", "QUEUED", "WAITING", "RUNNING"]);
    if (st && !inFlight.has(st)) {
      throw new Error(
        json.data?.error_message?.trim() || `Video task stopped with status: ${json.data?.status ?? st}`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Video generation timed out. Please try again.");
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
  for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
    const res = await fetchStatusWithTimeout(
      `/api/kie/veo/status?taskId=${encodeURIComponent(taskId)}${keyParam}`,
    );
    const json = await readVeoStatusResponse(res);
    if (!res.ok) {
      throw new Error(json.error || `Veo status check failed (HTTP ${res.status}).`);
    }
    const d = json.data;
    if (!d) throw new Error("Veo status returned no data.");
    if (d.successFlag === 1) {
      const u = d.response?.resultUrls?.[0];
      if (!u) throw new Error("No video URL in completed Veo task.");
      return u;
    }
    if (d.successFlag === 2 || d.successFlag === 3) {
      throw new Error(d.errorMessage?.trim() || "Veo generation failed.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Veo generation timed out. Please try again.");
}
