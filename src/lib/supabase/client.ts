import { createBrowserClient } from "@supabase/ssr";

// For browser usage we rely directly on NEXT_PUBLIC_* envs,
// which Next.js/Vercel inline at build time.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase client misconfigured: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

