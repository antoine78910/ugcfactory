function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Registers a processing row in `studio_generations`. Returns the new row id, or null on failure.
 * Retries a few times so a brief network blip does not drop in-flight jobs from history after reload.
 */
export async function registerStudioGenerationClient(body: Record<string, unknown>): Promise<string | null> {
  const delaysMs = [0, 400, 1200];
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (delaysMs[attempt]! > 0) await sleep(delaysMs[attempt]!);
    try {
      const res = await fetch("/api/studio/generations/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { rows?: { id: string }[] } };
      const id = json.data?.rows?.[0]?.id;
      if (typeof id === "string" && id.trim()) return id.trim();
    } catch {
      /* retry */
    }
  }
  return null;
}

/**
 * Registers an already-failed generation so it appears in the user's history.
 */
export async function registerFailedStudioGeneration(body: {
  kind: string;
  label: string;
  provider: string;
  errorMessage: string;
  inputUrls?: string[];
  model?: string;
}): Promise<string | null> {
  return registerStudioGenerationClient({
    ...body,
    status: "failed",
    creditsCharged: 0,
  });
}
