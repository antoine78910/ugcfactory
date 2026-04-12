import type Stripe from "stripe";

/**
 * Stripe subscription period end: prefer `subscription.items.data[0].current_period_end`
 * (current API typings), with fallback to legacy root `current_period_end` if present.
 * Values are Unix seconds unless they look like milliseconds.
 */
export function stripeSubscriptionPeriodEndUnix(sub: Stripe.Subscription): number | undefined {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: number | null }).current_period_end;
  const raw = fromItem ?? legacy;
  if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const seconds = raw > 1e12 ? Math.round(raw / 1000) : raw;
  if (seconds <= 0) return undefined;
  return seconds;
}

export function stripeSubscriptionPeriodEndIso(sub: Stripe.Subscription): string | undefined {
  const sec = stripeSubscriptionPeriodEndUnix(sub);
  if (sec == null) return undefined;
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function stripeSubscriptionPeriodEndDate(sub: Stripe.Subscription): Date | undefined {
  const iso = stripeSubscriptionPeriodEndIso(sub);
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
