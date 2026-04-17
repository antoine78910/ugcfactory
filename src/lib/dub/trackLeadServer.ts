import type { Dub } from "dub";

/**
 * Lazy-load the Dub SDK so `next build` / "Collecting page data" never evaluates
 * the `dub` package at module init (avoids EBADF / fstat issues on Vercel + Turbopack).
 */
let dubClient: Dub | null | undefined;

async function getDubClient(): Promise<Dub | null> {
  if (dubClient !== undefined) return dubClient;
  const token = process.env.DUB_API_KEY?.trim();
  if (!token) {
    dubClient = null;
    return null;
  }
  try {
    const { Dub: DubClass } = await import("dub");
    dubClient = new DubClass({ token });
    return dubClient;
  } catch {
    dubClient = null;
    return null;
  }
}

export type DubLeadParams = {
  clickId: string;
  customerExternalId: string;
  customerEmail?: string;
  customerName?: string;
  customerAvatar?: string | null;
  /** Default "Sign up" — Dub uses this to tie later sale events via `leadEventName`. */
  eventName?: string;
  /**
   * "async" (default) — fire and forget with attribution.
   * "deferred" — no clickId yet; Dub retroactively matches a prior click for this customer.
   * "wait" — block until Dub confirms the event.
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
export async function trackDubLeadServer(params: DubLeadParams): Promise<void> {
  const externalId = params.customerExternalId.trim();
  if (!externalId) return;

  const client = await getDubClient();
  if (!client) return;

  const clickId = params.clickId.trim();
  const mode = params.mode ?? (clickId ? "async" : "deferred");

  try {
    await client.track.lead({
      clickId,
      eventName: params.eventName?.trim() || "Sign up",
      customerExternalId: externalId,
      customerEmail: params.customerEmail?.trim() || undefined,
      customerName: params.customerName?.trim() || undefined,
      customerAvatar: params.customerAvatar?.trim() || undefined,
      mode,
    });
  } catch (err) {
    console.error("[dub] track.lead failed", err instanceof Error ? err.message : err);
  }
}
