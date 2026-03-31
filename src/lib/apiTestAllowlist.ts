import { getEnv } from "@/lib/env";

/**
 * Permanent allowlist (code-level) for API test access.
 * Env allowlist is still supported and merged below.
 */
const ALWAYS_ALLOWED_API_TEST_EMAILS = new Set<string>([
  "anto.delbos@gmail.com",
  "paulyaniskacou@gmail.com",
]);

/** Parse `API_TEST_ALLOWED_EMAILS` (comma / semicolon / whitespace separated). */
export function parseApiTestAllowedEmails(): Set<string> {
  const raw = getEnv("API_TEST_ALLOWED_EMAILS")?.trim() ?? "";
  const dynamic = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return new Set([...ALWAYS_ALLOWED_API_TEST_EMAILS, ...dynamic]);
}

/** True when this email may open `/apitest`. Empty env → nobody (deny-by-default). */
export function isEmailAllowedForApiTest(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const allow = parseApiTestAllowedEmails();
  if (allow.size === 0) return false;
  return allow.has(email.trim().toLowerCase());
}
