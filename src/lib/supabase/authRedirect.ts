/**
 * OAuth (Google), magic link, and email-confirmation return URL.
 *
 * **Browser:** always `window.location.origin` + `/auth/callback` so the PKCE
 * `code_verifier` cookie matches the host that started the flow (see `proxy.ts`).
 * Using `NEXT_PUBLIC_APP_URL` here while the user is on another host (e.g. localhost
 * with prod env, or a preview URL) breaks `exchangeCodeForSession`.
 *
 * **Google consent “Access the application …” host:** Google shows the hostname of
 * Supabase’s OAuth `redirect_uri` (`…/auth/v1/callback`). To show **youry.io** instead of
 * `*.supabase.co`, add a **Custom Domain** in Supabase (Project Settings → Custom Domains),
 * set `NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN` (or point `NEXT_PUBLIC_SUPABASE_URL` at that host),
 * add the matching redirect URI in Google Cloud (e.g. `https://api.youry.io/auth/v1/callback`),
 * and redeploy. Also set OAuth consent **App name** to “Youry” in Google Cloud.
 */
function callbackBase(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://app.youry.io";
  return `${base.replace(/\/+$/, "")}/auth/callback`;
}

/**
 * OAuth / magic-link / email-confirm return URL. Pass `nextPath` (same-origin path + query,
 * e.g. `/redeem?token=...`) so `/auth/callback` can redirect there after the session is set.
 */
export function getAuthCallbackUrl(nextPath?: string | null): string {
  const base = callbackBase();
  const next = typeof nextPath === "string" ? nextPath.trim() : "";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return base;
  }
  return `${base}?next=${encodeURIComponent(next)}`;
}
