import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { getSupabaseUrlOptional } from "@/lib/supabase/env";

/**
 * Server-only Supabase client with service role key.
 * Use for Storage uploads and other admin operations.
 * Only available when SUPABASE_SERVICE_ROLE_KEY is set.
 */
export function createSupabaseServiceClient() {
  const url = getSupabaseUrlOptional();
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}
