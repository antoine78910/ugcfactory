import type { User } from "@supabase/supabase-js";

/**
 * Resolves the best available email from a Supabase session user.
 * Some OAuth flows leave `user.email` empty while still exposing the address
 * on `user_metadata` or provider `identities[].identity_data` (needed for allowlists / Stripe).
 */
export function sessionUserEmail(user: User): string | null {
  const direct = user.email?.trim();
  if (direct) return direct;

  const meta = user.user_metadata;
  if (meta && typeof meta.email === "string") {
    const e = meta.email.trim();
    if (e) return e;
  }

  for (const id of user.identities ?? []) {
    const data = id.identity_data as Record<string, unknown> | undefined;
    if (data && typeof data.email === "string") {
      const e = data.email.trim();
      if (e) return e;
    }
  }

  return null;
}
