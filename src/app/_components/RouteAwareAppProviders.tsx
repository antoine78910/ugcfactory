"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

/**
 * Lazy boundary for the heavy auth/billing provider stack. The LP (`/`) is
 * `force-static` and never touches Supabase, Stripe pricing or the credits
 * context, so we keep that module out of the LP's initial JS bundle and only
 * fetch it when the user reaches an app route.
 *
 * Lighthouse reported ~140 KiB of unused JS on the LP coming from this stack
 * being eagerly imported in the root layout.
 */
const AppProviders = dynamic(() => import("./AppProviders"), {
  ssr: false,
  loading: () => null,
});

/**
 * Paths that share the marketing LP shell and don't need Supabase / billing
 * providers. Anything else (auth, onboarding, studio, redeem, workflow…) gets
 * the full provider stack via the lazy import above.
 */
function isMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/";
}

export function RouteAwareAppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = useMemo(() => isMarketingPath(pathname), [pathname]);

  if (skip) {
    return <>{children}</>;
  }
  return <AppProviders>{children}</AppProviders>;
}
