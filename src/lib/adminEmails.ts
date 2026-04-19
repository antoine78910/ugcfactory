/**
 * Primary admin accounts (layout gate + `requireAdmin()` on API routes).
 * Comparison is always lowercase-trimmed.
 */
export const PRIMARY_ADMIN_EMAILS = new Set<string>([
  "anto.delbos@mail.com",
  "anto.delbos@gmail.com",
]);

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return PRIMARY_ADMIN_EMAILS.has(email.trim().toLowerCase());
}
