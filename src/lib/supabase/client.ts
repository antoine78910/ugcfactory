import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseBrowserConfigFromEnv } from "@/lib/supabase/env";

let singleton: SupabaseClient | null = null;

export function peekSupabaseBrowserSingleton(): SupabaseClient | null {
  return singleton;
}

export function setSupabaseBrowserSingleton(client: SupabaseClient | null) {
  singleton = client;
}

/**
 * Shared browser client. Prefer `useSupabaseBrowserClient()` from `BrowserSupabaseProvider`
 * in React so UI updates when the client becomes available after `/api/supabase-public-config`.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (singleton) return singleton;
  const cfg = readSupabaseBrowserConfigFromEnv();
  if (!cfg) return null;
  singleton = createBrowserClient(cfg.url, cfg.key);
  return singleton;
}

/** For non-React code (e.g. uploads) after `BrowserSupabaseProvider` may still be resolving. */
export async function waitForSupabaseBrowserClient(maxMs = 12000): Promise<SupabaseClient | null> {
  let c = peekSupabaseBrowserSingleton() ?? createSupabaseBrowserClient();
  if (c) return c;
  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const id = setInterval(() => {
      c = peekSupabaseBrowserSingleton() ?? createSupabaseBrowserClient();
      if (c) {
        clearInterval(id);
        resolve(c);
      } else if (Date.now() >= deadline) {
        clearInterval(id);
        resolve(null);
      }
    }, 40);
  });
}
