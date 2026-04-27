"use client";

import type { ReactNode } from "react";
import { BrowserSupabaseProvider } from "@/lib/supabase/BrowserSupabaseProvider";
import { CreditsPlanProvider } from "@/app/_components/CreditsPlanContext";
import { StudioAccessGuard } from "@/app/_components/StudioAccessGuard";
import { RedeemTokenGuard } from "@/app/_components/RedeemTokenGuard";

/**
 * Heavy auth/billing stack (Supabase + Stripe pricing tables + studio guards).
 *
 * Bundled as a single client module so it can be code-split out of the marketing
 * landing page (`/`). The LP is `force-static` and never reads from Supabase or
 * the credits/plan context, so shipping ~140 KiB of unused JS there was the
 * single biggest LP regression flagged by Lighthouse.
 *
 * Loaded lazily via `RouteAwareAppProviders` for any path that isn't the
 * marketing LP. SSR is disabled because every consumer below is a `'use client'`
 * boundary and only reads its data after hydration.
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserSupabaseProvider>
      <CreditsPlanProvider>
        <StudioAccessGuard />
        <RedeemTokenGuard />
        {children}
      </CreditsPlanProvider>
    </BrowserSupabaseProvider>
  );
}
