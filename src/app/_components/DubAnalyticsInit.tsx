"use client";

import { Analytics as DubAnalytics } from "@dub/analytics/react";
import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const DUB_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_DUB_PUBLISHABLE_KEY?.trim() ?? "dub_pk_HMcoWNyXmq6E8OQGgpK6eEcF";
const DUB_REFER_DOMAIN =
  process.env.NEXT_PUBLIC_DUB_REFER_DOMAIN?.trim() ?? "go.youry.io";

/**
 * Reads `dub_id` from URL query params via Next.js `useSearchParams` (reactive
 * to client-side navigation) and saves it as a first-party `.youry.io` cookie
 * so the signup flow can read it even when the param is no longer in the URL.
 * Must be inside a <Suspense> boundary because useSearchParams requires it.
 */
function DubClickIdGuardInner() {
  const searchParams = useSearchParams();
  const dubIdFromUrl = searchParams.get("dub_id")?.trim() ?? "";

  useEffect(() => {
    if (!dubIdFromUrl) return;
    try {
      const existing = document.cookie.match(/(?:^|;\s*)dub_id=([^;]+)/)?.[1];
      if (existing) return;
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
      // SameSite=Lax is required so the cookie is sent on cross-site top-level
      // navigations (e.g. returning from Google OAuth or Stripe checkout).
      document.cookie = `dub_id=${encodeURIComponent(dubIdFromUrl)};domain=.youry.io;path=/;expires=${expires};SameSite=Lax`;
    } catch {
      /* never block the page */
    }
  }, [dubIdFromUrl]);

  return null;
}

function DubClickIdQueryParamGuard() {
  return (
    <Suspense fallback={null}>
      <DubClickIdGuardInner />
    </Suspense>
  );
}

/**
 * Dub client-side conversion + referral click tracking.
 * cookieOptions.domain  → `.youry.io` so the cookie is shared across all
 *                          youry.io subdomains (www ↔ app).
 * cookieOptions.sameSite → `lax` so the cookie is included on cross-site
 *                          top-level navigations (Google OAuth redirect back,
 *                          Stripe checkout return, etc.).
 * @see https://dub.co/docs/analytics/quickstart
 */
export function DubAnalyticsInit() {
  if (!DUB_PUBLISHABLE_KEY) return null;
  return (
    <>
      <DubAnalytics
        publishableKey={DUB_PUBLISHABLE_KEY}
        domainsConfig={{
          refer: DUB_REFER_DOMAIN,
        }}
        cookieOptions={{
          domain: ".youry.io",
          // Without sameSite: 'lax', the Dub script may default to Strict,
          // which would block the cookie from being sent when the browser
          // returns from an external redirect (OAuth, Stripe, etc.).
          sameSite: "lax",
        }}
      />
      <DubClickIdQueryParamGuard />
    </>
  );
}
