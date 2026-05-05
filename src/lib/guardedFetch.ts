"use client";

export type OutOfCreditsDetail = {
  need: number;
  have: number;
  planId: string;
};

export const OUT_OF_CREDITS_EVENT = "out-of-credits";

/**
 * Wraps `fetch` and intercepts 402 INSUFFICIENT_CREDITS responses.
 * On 402, dispatches a global `out-of-credits` CustomEvent with the cost/balance
 * so a single mounted modal can display the upsell. Caller receives `blocked: true`
 * and should NOT proceed with provider-side flow (no toast, no row insert).
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ blocked: boolean; response: Response }> {
  const response = await fetch(input, init);
  if (response.status !== 402) return { blocked: false, response };

  let detail: OutOfCreditsDetail | null = null;
  try {
    const data = (await response.clone().json()) as {
      error?: string;
      need?: number;
      have?: number;
      planId?: string;
    };
    if (data?.error === "INSUFFICIENT_CREDITS") {
      detail = {
        need: Number(data.need ?? 0),
        have: Number(data.have ?? 0),
        planId: String(data.planId ?? "free"),
      };
    }
  } catch {
    return { blocked: false, response };
  }

  if (!detail) return { blocked: false, response };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<OutOfCreditsDetail>(OUT_OF_CREDITS_EVENT, { detail }));
  }
  return { blocked: true, response };
}
