/**
 * In-process throttle for "cheap to skip" maintenance jobs that previously ran
 * on every API request (e.g. stale-job sweeper, refund-hint sweeper).
 *
 * Per-pod (no Redis): on a multi-pod deployment each pod runs the job at most
 * once per TTL, which is still 1-2 orders of magnitude less than today.
 */

const stores = new Map<string, Map<string, number>>();

/**
 * Returns true if `bucket+key` has not been marked run within `ttlMs`. Marks it
 * run on the way out, so the caller can treat the return value as "go".
 */
export function shouldRunThrottled(bucket: string, key: string, ttlMs: number): boolean {
  let store = stores.get(bucket);
  if (!store) {
    store = new Map();
    stores.set(bucket, store);
  }
  const now = Date.now();
  const last = store.get(key);
  if (last !== undefined && now - last < ttlMs) return false;
  store.set(key, now);
  return true;
}

/** Test-only: clear the throttle state. */
export function resetThrottleState(): void {
  stores.clear();
}
