/**
 * Centralized DataFast goal helpers for the $1 / 1€ trial funnel.
 *
 * Funnel stages (top → bottom):
 *   1. trial_view_setup            – User lands on /setup or /onboarding setup step.
 *   2. trial_initiate_checkout     – User clicks "Start for $1 / 1€" → Stripe Checkout opens.
 *   3. trial_paid_usd / trial_paid_eur – User returns from Stripe with checkout=trial_success.
 *   4. lta_url_submitted           – User clicks "Generate" from URL on Link to Ad.
 *   5. lta_angles_generated        – Pipeline finished and 3 angles/scripts are ready.
 *   6. lta_image_generated         – At least one nano-banana UGC image rendered successfully.
 *   7. lta_video_generate_clicked  – User clicks "Generate Video" (Kling) for an angle.
 *   8. trial_upgrade_dialog_viewed – Subscription upgrade popup is shown to a trial user.
 *   9. trial_upgrade_dialog_plan_clicked – Trial user clicks one of the plans inside the popup.
 *  10. subscription_initiate_checkout – User clicks Subscribe / Upgrade on /subscription.
 *  11. subscription_paid           – User returns from Stripe after a subscription checkout.
 *
 * Goal naming rules (DataFast):
 *   - Lowercase letters, digits, `_` and `-` only.
 *   - Max 64 chars.
 *   - Custom params: ≤10 params, names lowercase snake/kebab, values strings ≤255 chars.
 * @see https://datafa.st/docs/custom-goals
 */

export const DATAFAST_GOALS = {
  trial_view_setup: "trial_view_setup",
  trial_initiate_checkout: "trial_initiate_checkout",
  trial_paid_usd: "trial_paid_usd",
  trial_paid_eur: "trial_paid_eur",
  lta_url_submitted: "lta_url_submitted",
  lta_angles_generated: "lta_angles_generated",
  lta_image_generated: "lta_image_generated",
  lta_video_generate_clicked: "lta_video_generate_clicked",
  trial_upgrade_dialog_viewed: "trial_upgrade_dialog_viewed",
  trial_upgrade_dialog_plan_clicked: "trial_upgrade_dialog_plan_clicked",
  subscription_initiate_checkout: "subscription_initiate_checkout",
  subscription_paid: "subscription_paid",
} as const;

export type DatafastGoal = (typeof DATAFAST_GOALS)[keyof typeof DATAFAST_GOALS];

/**
 * Sanitize a custom-parameter value: coerce to string, trim, and clamp to 255 chars.
 * Returns `undefined` for empty/blank input so the param is dropped (DataFast hard limit: 10 params).
 */
function sanitizeParamValue(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;
  const s = typeof input === "string" ? input : String(input);
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 255 ? trimmed.slice(0, 255) : trimmed;
}

/**
 * Build the params object DataFast expects (lowercase keys, ≤255-char string values, ≤10 keys).
 */
function buildDatafastParams(
  params?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!params) return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [rawKey, rawVal] of Object.entries(params)) {
    if (count >= 10) break;
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64);
    if (!key) continue;
    const value = sanitizeParamValue(rawVal);
    if (value === undefined) continue;
    out[key] = value;
    count += 1;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Fire a DataFast goal from the browser. Safe to call on the server (no-op).
 *
 * The `<Script id="datafast-queue">` snippet in `app/layout.tsx` guarantees that
 * calls made before the main script loads are queued and replayed.
 */
export function trackDatafastGoal(
  goal: DatafastGoal,
  params?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    const fn = window.datafast;
    if (typeof fn !== "function") return;
    const safeParams = buildDatafastParams(params);
    if (safeParams) {
      fn(goal, safeParams);
    } else {
      fn(goal);
    }
  } catch {
    /* analytics must never break the app */
  }
}

/** Convenience: fire `trial_paid_usd` or `trial_paid_eur` based on currency. */
export function trackTrialPaid(currency: string | null | undefined): void {
  const c = (currency ?? "").toLowerCase();
  if (c === "eur") {
    trackDatafastGoal(DATAFAST_GOALS.trial_paid_eur, { currency: "eur" });
    return;
  }
  trackDatafastGoal(DATAFAST_GOALS.trial_paid_usd, { currency: "usd" });
}
