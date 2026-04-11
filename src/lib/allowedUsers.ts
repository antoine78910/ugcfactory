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
const ALLOWED_USER_EMAILS = new Set<string>([
  "anto.delbos@gmail.com",
]);

/**
 * Returns true when this email is permitted to access the application.
 * Always call with the email directly from the Supabase JWT (server-side only).
 */
export function isAllowedUser(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return ALLOWED_USER_EMAILS.has(email.trim().toLowerCase());
}
