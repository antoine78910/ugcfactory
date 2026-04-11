import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKeyOptional, getSupabaseUrlOptional } from "@/lib/supabase/env";

/**
 * Browser Supabase client. Returns `null` when public env is missing (e.g. Vercel misconfiguration)
 * so the app can render instead of throwing during hydration.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = getSupabaseUrlOptional();
  const key = getSupabaseAnonKeyOptional();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

