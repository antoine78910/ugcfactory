import { getEnv, requireEnv } from "@/lib/env";

/**
 * Public Supabase API base URL used by browser + server clients.
 *
 * When `NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN` is set (e.g. `https://api.youry.io` after
 * Supabase → Project Settings → Custom Domains), OAuth flows use that host so Google’s
 * consent screen shows your domain instead of `*.supabase.co`.
 *
 * Otherwise falls back to `NEXT_PUBLIC_SUPABASE_URL` (the default `*.supabase.co` URL).
 */
export function getSupabaseUrlOptional(): string | undefined {
  const custom = process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN?.trim();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const url = custom || base;
  return url ? url.replace(/\/+$/, "") : undefined;
}

export function getSupabaseUrl(): string {
  const url = getSupabaseUrlOptional();
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN for branded Google OAuth)",
    );
  }
  return url;
}

export function getSupabaseAnonKeyOptional(): string | undefined {
  const raw = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!raw) return undefined;
  let k = raw;
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k.length > 0 ? k : undefined;
}

/** URL + anon key from build/runtime env (no network). */
export function readSupabaseBrowserConfigFromEnv(): { url: string; key: string } | null {
  const url = getSupabaseUrlOptional();
  const key = getSupabaseAnonKeyOptional();
  if (!url || !key) return null;
  return { url, key };
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function hasPublicSupabaseConfig(): boolean {
  return readSupabaseBrowserConfigFromEnv() !== null;
}

