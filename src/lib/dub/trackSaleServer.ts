import type { Dub } from "dub";

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

export type DubSaleParams = {
  customerExternalId: string;
  /** Amount in cents. */
  amount: number;
  /** Stripe invoice/session ID — used as idempotency key. */
  invoiceId?: string;
  paymentProcessor?: string;
  eventName?: string;
  currency?: string;
  metadata?: Record<string, string>;
};

/**
 * Server-side Dub sale event. No-op if `DUB_API_KEY` is unset or amount is 0.
 * Errors are logged and swallowed so the webhook never returns a non-200.
 */
export async function trackDubSaleServer(params: DubSaleParams): Promise<void> {
  const externalId = params.customerExternalId.trim();
  if (!externalId || params.amount <= 0) return;

  const client = await getDubClient();
  if (!client) return;

  try {
    await client.track.sale({
      customerExternalId: externalId,
      amount: params.amount,
      paymentProcessor: (params.paymentProcessor ?? "stripe") as "stripe",
      eventName: params.eventName?.trim() || "Purchase",
      ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
  } catch (err) {
    console.error("[dub] track.sale failed", err instanceof Error ? err.message : err);
  }
}
