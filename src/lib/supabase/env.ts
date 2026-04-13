import { getEnv, requireEnv } from "@/lib/env";

function truthyEnv(v: string | undefined): boolean {
  const t = (v ?? "").trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/**
 * Public Supabase API base URL used by browser + server clients.
 *
 * When `NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN` is set (e.g. `https://api.youry.io` after
 * Supabase → Project Settings → Custom Domains), OAuth flows use that host so Google’s
 * consent screen shows your domain instead of `*.supabase.co`.
 *
 * Otherwise falls back to `NEXT_PUBLIC_SUPABASE_URL` (the default `*.supabase.co` URL).
 *
 * Local dev: if both custom domain and `NEXT_PUBLIC_SUPABASE_URL` are set, we prefer the
 * direct `*.supabase.co` URL in development so a copied production env still works when
 * the custom host does not resolve locally (DNS). Set
 * `NEXT_PUBLIC_SUPABASE_USE_CUSTOM_DOMAIN_IN_DEV=true` to force the custom host in dev.
 * Set `NEXT_PUBLIC_SUPABASE_USE_DIRECT_URL=true` to always ignore the custom domain.
 */
export function getSupabaseUrlOptional(): string | undefined {
  const custom = process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN?.trim();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (truthyEnv(process.env.NEXT_PUBLIC_SUPABASE_USE_DIRECT_URL) && base) {
    return base.replace(/\/+$/, "");
  }

  const devPreferDirect =
    process.env.NODE_ENV === "development" &&
    Boolean(base) &&
    Boolean(custom) &&
    !truthyEnv(process.env.NEXT_PUBLIC_SUPABASE_USE_CUSTOM_DOMAIN_IN_DEV);

  const url = devPreferDirect ? base : custom || base;
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

