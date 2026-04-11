/**
 * OAuth (Google), magic link, and email-confirmation return URL.
 *
 * **Browser:** always `window.location.origin` + `/auth/callback` so the PKCE
 * `code_verifier` cookie matches the host that started the flow (see `middleware.ts`).
 * Using `NEXT_PUBLIC_APP_URL` here while the user is on another host (e.g. localhost
 * with prod env, or a preview URL) breaks `exchangeCodeForSession`.
 *
 * **Google consent UI:** If users still see `*.supabase.co` as the app, that comes from
 * Google’s OAuth screen (redirect_uri is always Supabase’s `/auth/v1/callback`). To show
 * “Youry” prominently: Supabase → Authentication → Providers → Google → add **your**
 * Google Cloud OAuth Client ID + secret; then Google Cloud Console → OAuth consent screen
 * set **App name** to “Youry”, **Application home page** to https://youry.io or
 * https://app.youry.io, and keep the authorized redirect URI
 * `https://<project-ref>.supabase.co/auth/v1/callback` as Supabase documents.
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
