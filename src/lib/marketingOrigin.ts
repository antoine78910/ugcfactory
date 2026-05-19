const DEFAULT_MARKETING_ORIGIN = "https://www.youry.io";

/** Public marketing site origin (LP), not the authenticated app host. */
export function marketingOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() ||
    DEFAULT_MARKETING_ORIGIN;
  return raw.replace(/\/+$/, "");
}

function isAppStudioHost(host: string): boolean {
  return host.toLowerCase() === "app.youry.io";
}

/**
 * Absolute URL of the marketing landing page (`/`).
 * On `app.youry.io` (or local app dev) points at www.youry.io; on marketing hosts uses same origin.
 */
export function marketingLandingUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (!isAppStudioHost(host)) {
      return `${window.location.origin.replace(/\/+$/, "")}/`;
    }
  }
  return `${marketingOrigin()}/`;
}
