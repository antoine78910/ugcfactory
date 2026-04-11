/**
 * Server-side allowlist of emails permitted to use application APIs.
 *
 * Security notes:
 * - Hard-coded at build time. Not configurable via env vars — prevents bypass
 *   via deployment config changes or environment injection.
 * - Comparison is always lowercase-trimmed to prevent spoofing with casing.
 * - This is the single source of truth: every protected route goes through
 *   requireSupabaseUser() which enforces this check.
 */

/** Unlimited credits + admin bypass. Credits are hardcoded, not from DB. */
const ALLOWED_USER_EMAILS = new Set<string>([
  "anto.delbos@gmail.com",
]);

/**
 * Personal API auto-activation — uses real DB credits but routes generations
 * through the account's own provider API keys (KIE + PiAPI).
 * Credits are unique per account (from user_credit_grants ledger).
 */
const PERSONAL_API_USER_EMAILS = new Set<string>([
  "paulyaniskacou@gmail.com",
]);

/**
 * Returns true when this email is permitted to access the application.
 * Always call with the email directly from the Supabase JWT (server-side only).
 */
export function isAllowedUser(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return ALLOWED_USER_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Returns true when this account should auto-enable personal API keys.
 * These accounts use the real credit ledger — credits are NOT hardcoded.
 */
export function isPersonalApiUser(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return PERSONAL_API_USER_EMAILS.has(email.trim().toLowerCase());
}
