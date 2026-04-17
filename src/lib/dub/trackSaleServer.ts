import type { Dub } from "dub";

let dubClient: Dub | undefined;

async function getDubClient(): Promise<Dub | null> {
  if (dubClient !== undefined) return dubClient;
  const token = process.env.DUB_API_KEY?.trim();
  if (!token) {
    console.warn("[Dub] DUB_API_KEY is not set — sale tracking disabled. Add it to your Vercel env vars.");
    return null;
  }
  try {
    const { Dub: DubClass } = await import("dub");
    dubClient = new DubClass({ token });
    return dubClient;
  } catch (err) {
    console.error("[Dub] Failed to initialise Dub SDK:", err instanceof Error ? err.message : err);
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

  console.log("[Dub] track.sale →", {
    customerExternalId: externalId,
    amount: params.amount,
    invoiceId: params.invoiceId || "(none)",
    currency: params.currency || "usd",
  });

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
    console.log("[Dub] track.sale ✓ OK", { customerExternalId: externalId, amount: params.amount });
  } catch (err) {
    console.error("[Dub] track.sale ✗ FAILED", err instanceof Error ? err.message : err);
  }
}
