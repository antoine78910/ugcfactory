/**
 * Older Supabase projects may lack columns added after the initial `studio_generations` migration.
 * Retry inserts without optional columns when PostgREST reports a missing column (see SQL migrations).
 */

export function isMissingAspectRatioColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("aspect_ratio") && (m.includes("column") || m.includes("schema cache"));
}

export function isMissingModelColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("model") && (m.includes("column") || m.includes("schema cache"));
}

export function isMissingCreditBalanceAfterColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("credit_balance_after") && (m.includes("column") || m.includes("schema cache"));
}
