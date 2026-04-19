import { getDubApiToken, postDubTrackLead } from "@/lib/dub/dubApiClient";

export type DubLeadParams = {
  clickId: string;
  customerExternalId: string;
  customerEmail?: string;
  customerName?: string;
  customerAvatar?: string | null;
  /** Default "Sign Up", Dub uses this to tie later sale events via `leadEventName` (case-sensitive). */
  eventName?: string;
  /**
   * "async" (default), fire and forget with attribution.
   * "deferred", no clickId yet; Dub retroactively matches a prior click for this customer.
   * "wait", block until Dub confirms the event.
   */
  mode?: "async" | "deferred" | "wait";
};

/**
 * Server-side Dub lead (e.g. after signup).
 * - With clickId: direct attribution to the affiliate click.
 * - Without clickId (mode="deferred"): creates the customer record so Dub can retroactively
 *   attribute a prior click for this customerExternalId.
 * No-op if `DUB_API_KEY` is unset or `customerExternalId` is empty.
 * Errors are logged and swallowed so auth/signup flows never fail.
 */
/**
 * Returns `true` if the lead was successfully sent to Dub, `false` otherwise
 * (missing API key or Dub API error).
 */
export async function trackDubLeadServer(params: DubLeadParams): Promise<boolean> {
  const externalId = params.customerExternalId.trim();
  if (!externalId) return false;

  const token = getDubApiToken();
  if (!token) return false;

  const clickId = params.clickId.trim();
  const mode = params.mode ?? (clickId ? "async" : "deferred");

  console.log("[Dub] track.lead →", {
    customerExternalId: externalId,
    clickId: clickId || "(none)",
    mode,
    eventName: params.eventName?.trim() || "Sign Up",
  });

  try {
    await postDubTrackLead({
      clickId,
      eventName: params.eventName?.trim() || "Sign Up",
      customerExternalId: externalId,
      customerEmail: params.customerEmail?.trim() || undefined,
      customerName: params.customerName?.trim() || undefined,
      customerAvatar: params.customerAvatar?.trim() || undefined,
      mode,
    }, {
      token,
    });
    console.log("[Dub] track.lead ✓ OK", { customerExternalId: externalId, mode });
    return true;
  } catch (err) {
    console.error("[Dub] track.lead ✗ FAILED", err instanceof Error ? err.message : err);
    return false;
  }
}
