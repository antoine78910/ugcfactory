"use client";

import { useEffect } from "react";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";

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

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => void boot(), { timeout: 6000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const tid = window.setTimeout(() => void boot(), 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [supabase]);

  return null;
}
