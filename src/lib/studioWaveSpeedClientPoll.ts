import { completeStudioTask } from "@/lib/studioKlingClientPoll";

/** Align with `pollStudioGenerationRow` WaveSpeed terminal success detection. */
export function waveTranslateStatusIsSuccess(status: string | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return (
    s === "completed" ||
    s === "complete" ||
    s === "success" ||
    s === "succeeded" ||
    s === "done" ||
    s === "finished"
  );
}

export function pickFirstWaveTranslateVideoUrl(outputs: string[] | undefined): string | undefined {
  const list = (outputs ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (list.length === 0) return undefined;
  const videoish = list.find(
    (u) =>
      /\.(mp4|mov|webm)(\?|$)/i.test(u) ||
      u.includes("video/mp4") ||
      u.includes("video/quicktime") ||
      u.includes("video/webm"),
  );
  return videoish ?? list[0];
}

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ROUNDS = 120;
const STATUS_FETCH_TIMEOUT_MS = 45_000;

async function fetchPredictionWithTimeout(taskId: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), STATUS_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`/api/wavespeed/prediction?taskId=${encodeURIComponent(taskId)}`, {
      cache: "no-store",
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function pollWaveSpeedVideoTranslate(taskId: string): Promise<string> {
  const id = taskId.trim();
  if (!id) throw new Error("Missing translation task id.");

  for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
    const res = await fetchPredictionWithTimeout(id);
    const text = await res.text();
    let json: {
      data?: {
        status?: string;
        outputs?: string[];
        error?: string | null;
        done?: boolean;
        waitingForOutputs?: boolean;
        failed?: boolean;
      };
      error?: string;
    };
    try {
      json = text.trim() ? (JSON.parse(text) as typeof json) : {};
    } catch {
      const snippet = text.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(
        res.ok
          ? `Invalid translation status JSON: ${snippet}`
          : `Translation status error (HTTP ${res.status}): ${snippet}`,
      );
    }
    if (!res.ok) {
      throw new Error(json.error?.trim() || `Translation status failed (HTTP ${res.status}).`);
    }

    const d = json.data;
    if (d?.failed) {
      throw new Error(d.error?.trim() || "Translation failed.");
    }
    if (d?.done) {
      const u = pickFirstWaveTranslateVideoUrl(d.outputs);
      if (u) return u;
      throw new Error("Translation completed but returned no video URL.");
    }
    if (waveTranslateStatusIsSuccess(d?.status) && d?.waitingForOutputs) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Translation timed out. Please try again.");
}

export { completeStudioTask };
