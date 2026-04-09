/**
 * Registers a processing row in `studio_generations`. Returns the new row id, or null on failure.
 */
export async function registerStudioGenerationClient(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/studio/generations/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { rows?: { id: string }[] } };
    const id = json.data?.rows?.[0]?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
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
