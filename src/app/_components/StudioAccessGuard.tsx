"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isCheckoutGracePeriodActive,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import { isStudioToolPath } from "@/lib/studioPaths";

/**
 * Keeps users without an active $1 trial (with credits) or paid plan off studio tool routes.
 * They are sent to onboarding setup (paywall) instead.
 */
export function StudioAccessGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ctx = useCreditsPlanOptional();

  useEffect(() => {
    if (!ctx) return;
    if (ctx.isUnlimited) return;
    if (ctx.studioAccessAllowed !== false) return;
    if (isCheckoutGracePeriodActive()) return;
    if (!isStudioToolPath(pathname)) return;
    router.replace("/onboarding?step=setup");
  }, [ctx, pathname, router]);

  return null;
}
