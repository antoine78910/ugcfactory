/**
 * Response headers for Lighthouse “Best practices” / hardening.
 * Third-party cookies (Heyo, Datafast, Linkjolt) cannot be removed from our code — only vendors can migrate to first-party / CHIPS.
 */

const CSP_PARTS_BASE = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Next.js needs unsafe-inline for its runtime scripts; third-party widgets (heyo, stripe) also require it.
  "script-src 'self' 'unsafe-inline' https://datafa.st https://www.linkjolt.io https://linkjolt.io https://heyo.so https://*.heyo.so https://cdn.heyo.so https://js.stripe.com https://*.stripe.com https://browser.sentry-cdn.com https://www.clarity.ms https://scripts.clarity.ms https://accounts.google.com https://*.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://heyo.so https://*.heyo.so https://cdn.heyo.so https://accounts.google.com https://*.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://datafa.st https://*.datafa.st https://www.linkjolt.io https://linkjolt.io https://heyo.so https://*.heyo.so https://cdn.heyo.so https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.stripe.com https://m.stripe.network https://q.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://*.sentry.io https://cdn.jsdelivr.net https://www.clarity.ms https://scripts.clarity.ms https://a.clarity.ms https://accounts.google.com",
  "frame-src 'self' https://heyo.so https://*.heyo.so https://cdn.heyo.so https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://accounts.google.com https://*.gstatic.com",
  "object-src 'none'",
  "worker-src 'self' blob:",
];

export function contentSecurityPolicy(): string {
  const p = [...CSP_PARTS_BASE];
  if (process.env.VERCEL_ENV === "production") {
    p.push("upgrade-insecure-requests");
  } else {
    // Dev builds use eval for hot-module replacement and fast refresh.
    p[p.findIndex((d) => d.startsWith("script-src"))] += " 'unsafe-eval'";
  }
  return p.join("; ");
}

export function securityHeadersList(): { key: string; value: string }[] {
  const list: { key: string; value: string }[] = [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    // Safer than strict same-origin for OAuth / checkout popups
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",
    },
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  ];

  if (process.env.VERCEL_ENV === "production") {
    list.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return list;
}
