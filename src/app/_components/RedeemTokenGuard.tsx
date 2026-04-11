"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useBrowserSupabaseReady,
  useSupabaseBrowserClient,
} from "@/lib/supabase/BrowserSupabaseProvider";

/**
 * After sign-in (e.g. OAuth landing on `/` without `next`), if a redeem token was
 * stored in sessionStorage, send the user to `/redeem?token=…` so credits are claimed
 * and the success animation runs. Mounted from the root layout.
 */
export function RedeemTokenGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabaseBrowserClient();
  const ready = useBrowserSupabaseReady();

  useEffect(() => {
    if (!ready || pathname?.startsWith("/redeem")) return;
    const pending = sessionStorage.getItem("redeem_token_pending");
    if (!pending) return;
    if (supabase === null) return;

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      sessionStorage.removeItem("redeem_token_pending");
      router.replace(`/redeem?token=${encodeURIComponent(pending)}`);
    });
  }, [pathname, ready, supabase, router]);

  return null;
}
