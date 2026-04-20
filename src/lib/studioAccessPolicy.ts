/** $1 / 1€ trial access window after first successful payment (webhook sets `trial_started_at`). */
export const TRIAL_ACCESS_HOURS = 24;

const MS = TRIAL_ACCESS_HOURS * 60 * 60 * 1000;

export type TrialAppMetadata = {
  trial_active?: unknown;
  trial_started_at?: unknown;
  /** Set by credit/plan redeem links so users can access studio without trial checkout. */
  redeem_access_granted?: unknown;
  redeem_access_granted_at?: unknown;
};

export function parseTrialStartedAt(meta: TrialAppMetadata): string | null {
  const raw = meta.trial_started_at;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? t : null;
}

/** Legacy users: `trial_active` without `trial_started_at` keep access until metadata is backfilled. */
export function isTrialTimeWindowOpen(meta: TrialAppMetadata): boolean {
  if (meta.trial_active !== true) return false;
  const started = parseTrialStartedAt(meta);
  if (!started) return true;
  const t = Date.parse(started);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t < MS;
}

export function isTrialMetadataActive(meta: TrialAppMetadata): boolean {
  return meta.trial_active === true;
}

export function isRedeemAccessGranted(meta: TrialAppMetadata): boolean {
  return meta.redeem_access_granted === true;
}

/**
 * Whether the signed-in user may use studio tools (Link to Ad, image, video, etc.).
 * - Unlimited / personal-API: always true (handled before calling this).
 * - Paid subscription (plan not free): true.
 * - Else:
 *   - Active redeem-link entitlement: positive ledger balance is enough.
 *   - Otherwise: must have an active $1 trial window AND a positive ledger balance.
 */
export function computeStudioAccessAllowed(opts: {
  planId: "free" | string;
  trialMeta: TrialAppMetadata;
  creditBalance: number;
}): boolean {
  if (opts.planId !== "free") return true;
  if (isRedeemAccessGranted(opts.trialMeta)) return opts.creditBalance > 0;
  if (!isTrialMetadataActive(opts.trialMeta)) return false;
  if (!isTrialTimeWindowOpen(opts.trialMeta)) return false;
  return opts.creditBalance > 0;
}
