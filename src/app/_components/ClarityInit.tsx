"use client";

import { useEffect } from "react";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { loadOnFirstInteraction } from "./loadOnFirstInteraction";

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";

/**
 * Microsoft Clarity session-replay. Loads ~26 KiB of script + opens a long-lived
 * connection. We don't need the very first 0-3s of the LP recorded, so we boot
 * on first user interaction (or after a 12s fallback). Massive Total Blocking
 * Time win on the marketing page.
 */
export default function ClarityInit() {
  const supabase = useSupabaseBrowserClient();

  useEffect(() => {
    if (!CLARITY_PROJECT_ID) return;
    let cancelled = false;

    async function boot() {
      const Clarity = (await import("@microsoft/clarity")).default;
      if (cancelled) return;
      Clarity.init(CLARITY_PROJECT_ID);

      try {
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          Clarity.identify(user.id, undefined, undefined, user.email ?? undefined);
          Clarity.setTag("email", user.email ?? "unknown");
        }
      } catch {
        /* auth read is best-effort */
      }
    }

    const cleanup = loadOnFirstInteraction(() => void boot(), { fallbackMs: 12_000 });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [supabase]);

  return null;
}
