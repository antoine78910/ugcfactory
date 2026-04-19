import { getDubApiToken, postDubTrackSale } from "@/lib/dub/dubApiClient";

export type DubSaleParams = {
  customerExternalId: string;
  /** Amount in cents. */
  amount: number;
  /** Stripe invoice/session ID — used as idempotency key. */
  invoiceId?: string;
  paymentProcessor?: string;
  eventName?: string;
  /** Must match the lead `eventName` (case-sensitive) for attribution. */
  leadEventName?: string;
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

  const token = getDubApiToken();
  if (!token) return;

  const leadEventName = params.leadEventName?.trim() || "Sign Up";

  console.log("[Dub] track.sale →", {
    customerExternalId: externalId,
    amount: params.amount,
    invoiceId: params.invoiceId || "(none)",
    currency: params.currency || "usd",
    leadEventName,
  });

  try {
    await postDubTrackSale({
      customerExternalId: externalId,
      amount: params.amount,
      paymentProcessor:
        (params.paymentProcessor ?? "stripe") as "stripe" | "shopify" | "polar" | "paddle" | "revenuecat" | "custom",
      eventName: params.eventName?.trim() || "Purchase",
      leadEventName,
      ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    }, {
      token,
    });
    console.log("[Dub] track.sale ✓ OK", { customerExternalId: externalId, amount: params.amount });
  } catch (err) {
    console.error("[Dub] track.sale ✗ FAILED", err instanceof Error ? err.message : err);
  }
}
