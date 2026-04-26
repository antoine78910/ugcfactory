import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeadersList } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  /**
   * Tree-shake icon / animation libs we touch from many client components so the
   * marketing page (and every page) only ships the icons it actually renders.
   * Cuts ~50-100 KB of unused JS reported by Lighthouse on the LP.
   */
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "motion",
      "radix-ui",
      "sonner",
      "@dub/analytics",
    ],
  },
  /**
   * Tighter image defaults so any asset still going through `/_next/image`
   * (e.g. dynamic content, remote URLs) is served as AVIF/WebP when possible
   * and cached aggressively on the edge. Landing carousel PNGs now opt-in to
   * `unoptimized` because they are already compressed and served from
   * `/public/carousel/*` with an immutable `Cache-Control` header.
   */
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
  async headers() {
    /**
     * CORS for static assets so Microsoft Clarity (and any other session-replay tool)
     * can fetch our CSS / fonts / static media from `clarity.microsoft.com` to rebuild
     * the page in playback. Without `Access-Control-Allow-Origin`, replays show the
     * raw HTML with no styles. Public assets only — never apply this to API routes.
     */
    const PUBLIC_ASSET_CORS = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
      { key: "Timing-Allow-Origin", value: "*" },
      { key: "Vary", value: "Origin" },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeadersList(),
      },
      /**
       * Next.js build assets (hashed JS/CSS chunks, fonts, optimized images via next/font).
       * Already immutable thanks to content hashing, so safe to expose with CORS.
       */
      {
        source: "/_next/static/:path*",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Long-lived cache for immutable public video/image assets.
      {
        source: "/studio/:path*",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/carousel/:path*",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/steps/:path*",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:file(.*\\.(?:png|jpg|jpeg|webp|avif|ico|svg))",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/:file(.*\\.(?:woff|woff2|ttf|otf|eot))",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:file(.*\\.css)",
        headers: [
          ...PUBLIC_ASSET_CORS,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
