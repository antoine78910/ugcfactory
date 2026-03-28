import { getEnv } from "@/lib/env";

/** Parse `API_TEST_ALLOWED_EMAILS` (comma / semicolon / whitespace separated). */
export function parseApiTestAllowedEmails(): Set<string> {
  const raw = getEnv("API_TEST_ALLOWED_EMAILS")?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when this email may open `/apitest`. Empty env → nobody (deny-by-default). */
export function isEmailAllowedForApiTest(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const allow = parseApiTestAllowedEmails();
  if (allow.size === 0) return false;
  return allow.has(email.trim().toLowerCase());
}
