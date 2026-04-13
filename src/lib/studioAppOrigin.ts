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
