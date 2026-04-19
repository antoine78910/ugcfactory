import type { SupabaseClient, User } from "@supabase/supabase-js";

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

/**
 * Same as {@link sessionUserEmail}, then falls back to the service-role Auth record for this user id.
 * Safe: only returns the authenticated user's own email from Supabase Auth (no cross-user lookup).
 */
export async function resolveAuthUserEmail(
  user: User,
  admin: SupabaseClient | null,
): Promise<string | null> {
  const fromSession = sessionUserEmail(user);
  if (fromSession) return fromSession;
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error || !data?.user) return null;
    return sessionUserEmail(data.user);
  } catch {
    return null;
  }
}
