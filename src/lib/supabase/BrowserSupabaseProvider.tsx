"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseBrowserConfigFromEnv } from "@/lib/supabase/env";
import { peekSupabaseBrowserSingleton, setSupabaseBrowserSingleton } from "@/lib/supabase/client";

const ClientCtx = createContext<SupabaseClient | null>(null);
const ReadyCtx = createContext(false);

export function BrowserSupabaseProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;

    const finish = (c: SupabaseClient | null) => {
      if (cancelled) return;
      setSupabaseBrowserSingleton(c);
      setClient(c);
      setReady(true);
    };

    const existing = peekSupabaseBrowserSingleton();
    if (existing) {
      finish(existing);
      return () => {
        cancelled = true;
      };
    }

    const fromEnv = readSupabaseBrowserConfigFromEnv();
    if (fromEnv) {
      finish(createBrowserClient(fromEnv.url, fromEnv.key));
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/supabase-public-config", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { url?: string; anonKey?: string } | null) => {
        if (!j?.url || !j?.anonKey) {
          finish(null);
          return;
        }
        finish(createBrowserClient(j.url, j.anonKey));
      })
      .catch(() => finish(null));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ReadyCtx.Provider value={ready}>
      <ClientCtx.Provider value={client}>{children}</ClientCtx.Provider>
    </ReadyCtx.Provider>
  );
}

export function useSupabaseBrowserClient(): SupabaseClient | null {
  return useContext(ClientCtx);
}

export function useBrowserSupabaseReady(): boolean {
  return useContext(ReadyCtx);
}
