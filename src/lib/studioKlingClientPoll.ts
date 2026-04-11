/**
 * Client-side Kling/KIE Market polling + immediate DB persist.
 * Server poll still runs as a backup; this matches completed jobs to the row quickly (same pattern as Studio Video).
 */
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
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Kling status failed");
    const st = json.data?.status;
    if (st === "SUCCESS") {
      const list = json.data?.response ?? [];
      const u = list.map((x) => String(x).trim()).find((s) => s.length > 0);
      if (u) return u;
      // Rare race: success before URLs are present; keep polling (aligned with kling/status IN_PROGRESS).
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    if (st === "FAILED") throw new Error(json.data?.error_message || "Kling failed");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Kling timeout");
}
