/**
 * Authenticated app host (signin, signup, `/app/*` on subdomain).
 *
 * On marketing (`www.youry.io`), `next/link` to `/signin` triggers an RSC fetch to
 * `www…/signin` → middleware redirects to `app…/signin` → browser blocks (CORS).
 * Use `studioAppPath("/signin")` etc. so prefetch/navigation targets the app origin directly.
 */
export function studioAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_STUDIO_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://app.youry.io";
  return raw.replace(/\/+$/, "");
}

export function studioAppPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${studioAppOrigin()}${p}`;
}

/**
 * When marketing pages live on a different host than the authenticated app
 * (`NEXT_PUBLIC_STUDIO_APP_ORIGIN`), browser `fetch("/api/…")` would hit the wrong
 * origin and miss Supabase session cookies — causing 401 from route handlers.
 * Use this for client-side `/api/*` calls so they target the app origin when configured.
 */
export function studioBrowserApiUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const explicitApp = process.env.NEXT_PUBLIC_STUDIO_APP_ORIGIN?.trim();
  if (!explicitApp || !path.startsWith("/")) return path;
  const base = explicitApp.replace(/\/+$/, "");
  try {
    if (window.location.origin === base) return path;
    return `${base}${path}`;
  } catch {
    return path;
  }
}
