import type { User } from "@supabase/supabase-js";

import { isPrimaryAdminEmail } from "@/lib/adminEmails";
import { sessionUserEmail } from "@/lib/sessionUserEmail";

/**
 * Influencer demo accounts. They get the static-ad site templates in the workflow navbar.
 * Mark a real account with `app_metadata.influencer = true` (service role) or
 * `user_metadata.account_kind = "influencer"`. Primary admins can preview the same UI.
 */
export function isInfluencerAccount(user: User | null | undefined): boolean {
  if (!user) return false;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.influencer === true || userMeta.influencer === true) return true;
  const kind = typeof userMeta.account_kind === "string" ? userMeta.account_kind.trim().toLowerCase() : "";
  if (kind === "influencer") return true;
  return isPrimaryAdminEmail(sessionUserEmail(user));
}
