import { cookies } from "next/headers";

/** Cookie names set by DataFast analytics (https://datafa.st/docs/revenue-attribution-guide). */
const DATAFAST_VISITOR_COOKIE = "datafast_visitor_id";
const DATAFAST_SESSION_COOKIE = "datafast_session_id";

const STRIPE_METADATA_VALUE_MAX = 500;

/**
 * Reads DataFast cookies from the incoming request for Stripe revenue attribution.
 * Pass the result into Checkout Session `metadata` (and PaymentIntent metadata if you add one later).
 */
export async function getDataFastStripeMetadata(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const store = await cookies();
    const visitor = store.get(DATAFAST_VISITOR_COOKIE)?.value?.trim();
    const session = store.get(DATAFAST_SESSION_COOKIE)?.value?.trim();
    if (visitor) out.datafast_visitor_id = visitor.slice(0, STRIPE_METADATA_VALUE_MAX);
    if (session) out.datafast_session_id = session.slice(0, STRIPE_METADATA_VALUE_MAX);
  } catch {
    /* cookies() only valid during a request */
  }
  return out;
}
