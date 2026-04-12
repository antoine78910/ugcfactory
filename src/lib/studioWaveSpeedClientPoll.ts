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

export async function pollWaveSpeedVideoTranslate(taskId: string): Promise<string> {
  const id = taskId.trim();
  if (!id) throw new Error("Missing translation task id.");

  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/wavespeed/prediction?taskId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
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
    if (!res.ok) throw new Error(json.error || "Translation status failed");

    const d = json.data;
    if (d?.failed) {
      throw new Error(d.error?.trim() || "Translation failed");
    }
    if (d?.done) {
      const u = pickFirstWaveTranslateVideoUrl(d.outputs);
      if (u) return u;
      throw new Error("Translation completed but returned no video URL.");
    }
    if (waveTranslateStatusIsSuccess(d?.status) && d?.waitingForOutputs) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Translation timeout");
}

export { completeStudioTask };
