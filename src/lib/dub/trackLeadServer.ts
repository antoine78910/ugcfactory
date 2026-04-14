import { Dub } from "dub";

let dubClient: Dub | null | undefined;

function getDubClient(): Dub | null {
  if (dubClient !== undefined) return dubClient;
  const token = process.env.DUB_API_KEY?.trim();
  if (!token) {
    dubClient = null;
    return null;
  }
  dubClient = new Dub({ token });
  return dubClient;
}

export type DubLeadParams = {
  clickId: string;
  customerExternalId: string;
  customerEmail?: string;
  customerName?: string;
  customerAvatar?: string | null;
  /** Default "Sign up" — Dub uses this to tie later sale events via `leadEventName`. */
  eventName?: string;
};

/**
 * Server-side Dub lead (e.g. after signup). No-op if `DUB_API_KEY` is unset or `clickId` is empty.
 * Errors are logged and swallowed so auth/signup flows never fail.
 */
export async function trackDubLeadServer(params: DubLeadParams): Promise<void> {
  const clickId = params.clickId.trim();
  if (!clickId) return;

  const client = getDubClient();
  if (!client) return;

  const externalId = params.customerExternalId.trim();
  if (!externalId) return;

  try {
    await client.track.lead({
      clickId,
      eventName: params.eventName?.trim() || "Sign up",
      customerExternalId: externalId,
      customerEmail: params.customerEmail?.trim() || undefined,
      customerName: params.customerName?.trim() || undefined,
      customerAvatar: params.customerAvatar?.trim() || undefined,
      mode: "async",
    });
  } catch (err) {
    console.error("[dub] track.lead failed", err instanceof Error ? err.message : err);
  }
}
