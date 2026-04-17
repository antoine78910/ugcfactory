"use client";

import { Analytics as DubAnalytics } from "@dub/analytics/react";
import { useEffect } from "react";

const DUB_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_DUB_PUBLISHABLE_KEY?.trim() ?? "dub_pk_HMcoWNyXmq6E8OQGgpK6eEcF";
const DUB_REFER_DOMAIN =
  process.env.NEXT_PUBLIC_DUB_REFER_DOMAIN?.trim() ?? "go.youry.io";

/**
 * If the landing page (www.youry.io) forwarded `dub_id` as a query param
 * (e.g. app.youry.io/signup?dub_id=xxx), save it as a first-party cookie so
 * the signup flow can read it even when the param is not present on app pages.
 */
function DubClickIdQueryParamGuard() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const dubIdFromUrl = params.get("dub_id")?.trim();
      const existing = document.cookie.match(/(?:^|;\s*)dub_id=([^;]+)/)?.[1];
      console.log("[DubTrace] Analytics guard mount", {
        dubIdFromUrl: dubIdFromUrl || "(none)",
        existingCookieDubId: existing ? decodeURIComponent(existing) : "(none)",
      });
      if (!dubIdFromUrl) return;
      if (existing) {
        console.log("[Dub] dub_id already set in cookie:", decodeURIComponent(existing));
        return;
      }
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `dub_id=${encodeURIComponent(dubIdFromUrl)};domain=.youry.io;path=/;expires=${expires};SameSite=Lax`;
      console.log("[Dub] dub_id saved from URL query param:", dubIdFromUrl);
    } catch {
      // never block the page
    }
  }, []);
  return null;
}

/**
 * Dub client-side conversion + referral click tracking.
 * cookieOptions.domain is set to `.youry.io` so the cookie is shared between
 * www.youry.io and app.youry.io.
 * @see https://dub.co/docs/analytics/quickstart
 */
export function DubAnalyticsInit() {
  if (!DUB_PUBLISHABLE_KEY) return null;
  if (typeof window !== "undefined") {
    const logRuntime = (label: string) => {
      try {
        const w = window as Window & { dubAnalytics?: unknown };
        const da = w.dubAnalytics;
        const hasStub = typeof da === "function";
        const scriptInHead = Boolean(
          document.head?.querySelector("script[src*='dubcdn.com/analytics/script']"),
        );
        const cookieDubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]+)/)?.[1];
        console.log("[DubTrace] Analytics runtime check", {
          label,
          /** Dub injects `window.dubAnalytics` (no underscore). Docs mentioning `_dubAnalytics` are outdated. */
          hasDubAnalyticsFn: hasStub,
          dubScriptInHead: scriptInHead,
          cookieDubId: cookieDubId ? decodeURIComponent(cookieDubId) : "(none)",
        });
      } catch {
        /* ignore */
      }
    };
    setTimeout(() => logRuntime("t+1s"), 1000);
    setTimeout(() => logRuntime("t+3s"), 3000);
  }
  return (
    <>
      <DubAnalytics
        publishableKey={DUB_PUBLISHABLE_KEY}
        domainsConfig={{
          refer: DUB_REFER_DOMAIN,
        }}
        cookieOptions={{
          domain: ".youry.io",
        }}
      />
      <DubClickIdQueryParamGuard />
    </>
  );
}
