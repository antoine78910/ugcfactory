"use client";

import { PERSONAL_API_KEY_REQUIRED } from "@/lib/personalApiRequiredCode";
import { dispatchPersonalApiKeyRequired } from "@/lib/personalApiKeyEvents";

export type OutOfCreditsDetail = {
  need: number;
  have: number;
  planId: string;
};

export const OUT_OF_CREDITS_EVENT = "out-of-credits";

/**
 * Wraps `fetch` and intercepts:
 * - 402 INSUFFICIENT_CREDITS → OutOfCreditsModal
 * - 403 PERSONAL_API_KEY_REQUIRED → PersonalApiKeyModal (free BYOK)
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ blocked: boolean; response: Response }> {
  const response = await fetch(input, init);

  if (response.status === 403) {
    try {
      const data = (await response.clone().json()) as {
        error?: string;
        code?: string;
        message?: string;
      };
      if (
        data?.error === PERSONAL_API_KEY_REQUIRED ||
        data?.code === PERSONAL_API_KEY_REQUIRED
      ) {
        dispatchPersonalApiKeyRequired({
          message: typeof data.message === "string" ? data.message : undefined,
        });
        return { blocked: true, response };
      }
    } catch {
      /* fall through */
    }
  }

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
    if (detail.planId === "free") {
      dispatchPersonalApiKeyRequired({
        message:
          "On the free plan, add your Kie API key so generations are billed on your Kie account.",
      });
      return { blocked: true, response };
    }
    window.dispatchEvent(new CustomEvent<OutOfCreditsDetail>(OUT_OF_CREDITS_EVENT, { detail }));
  }
  return { blocked: true, response };
}
