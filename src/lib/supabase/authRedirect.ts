/**
 * OAuth (Google), magic link, and email-confirmation return URL.
 *
 * **Browser:** always `window.location.origin` + `/auth/callback` so the PKCE
 * `code_verifier` cookie matches the host that started the flow (see `middleware.ts`).
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
export function getAuthCallbackUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://app.youry.io";
  return `${base.replace(/\/+$/, "")}/auth/callback`;
}
