/**
 * Credit ledger stores integer "ticks" in Postgres (`user_credit_grants`, `studio_generations.credits_charged`).
 * 2 ticks = 1.0 display credit — allows billing steps of 0.5 (e.g. Google Nano Banana).
 */

export const LEDGER_TICKS_PER_DISPLAY_CREDIT = 2;

export function displayCreditsToLedgerTicks(display: number): number {
  if (!Number.isFinite(display) || display <= 0) return 0;
  return Math.max(0, Math.round(display * LEDGER_TICKS_PER_DISPLAY_CREDIT));
}

export function ledgerTicksToDisplayCredits(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  return ticks / LEDGER_TICKS_PER_DISPLAY_CREDIT;
}

/** UI label for a display credit amount (handles 0.5). */
export function formatDisplayCredits(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
