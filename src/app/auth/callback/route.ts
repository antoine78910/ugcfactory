import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { brevoUpsertContact, brevoTrackEvent } from "@/lib/brevo";

/** Same-origin path + query only; prevents open redirects. */
function resolveSafeNextRedirect(reqUrl: URL): URL {
  const fallback = new URL("/", reqUrl.origin);
  const raw = reqUrl.searchParams.get("next");
  if (!raw?.trim()) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return fallback;
  }
  const t = decoded.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) {
    return fallback;
  }
  try {
    const target = new URL(t, reqUrl.origin);
    if (target.origin !== reqUrl.origin) return fallback;
    return target;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const redactedCookieNames = (cookies: Array<{ name?: string }> | undefined) =>
    Array.isArray(cookies) ? cookies.map((c) => c.name).filter(Boolean) : [];

  const isAlreadyConnectedLike = (err: string | null | undefined) => {
    if (!err) return false;
    const s = String(err).toLowerCase();
    return (
      s.includes("already_connected") ||
      s.includes("already connected") ||
      s.includes("already authenticated") ||
      s.includes("already_auth") ||
      s.includes("vous êtes déjà connecté") ||
      s.includes("vous etes deja connect") ||
      s.includes("deja connecté") ||
      s.includes("deja connect") ||
      s.includes("connecté") ||
      s.includes("connecte")
    );
  };

  const homeUrl = new URL("/", url.origin);
  const signinUrl = new URL("/signin", url.origin);
  const postAuthUrl = resolveSafeNextRedirect(url);

  /**
   * Session cookies from `exchangeCodeForSession` MUST be set on the same
   * NextResponse that we return. Copying via `getAll()` from another response
   * fails in Next.js 15+: programmatic cookies are not reliably readable back,
   * and `set(cookie)` drops path/httpOnly/sameSite — so the browser never
   * stores the session and the next request hits `/` unauthenticated → /signin.
   */
  let redirectResponse = NextResponse.redirect(postAuthUrl, 302);

  console.log("[auth/callback] incoming", {
    host: req.headers.get("host"),
    path: url.pathname,
    hasCode: Boolean(code),
    hasError: Boolean(error),
    error: error ? String(error) : undefined,
    errorDescription: errorDescription ? String(errorDescription).slice(0, 120) : undefined,
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            req.cookies.set(name, value);
            redirectResponse.cookies.set(name, value, options);
          }
        } catch (e) {
          console.error("[auth/callback] cookies.setAll failed", e);
        }
      },
    },
  });

  function redirectSignin(reason: string) {
    if (errorDescription) {
      signinUrl.searchParams.set("error_description", errorDescription);
    }
    console.log("[auth/callback] redirectToSignin", { reason, target: signinUrl.toString() });
    return NextResponse.redirect(signinUrl, 302);
  }

  // OAuth returned an error in the query string
  if (error) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        console.log("[auth/callback] oauth error but session present; redirect home");
        return redirectResponse;
      }
    } catch {
      // fall through
    }

    if (isAlreadyConnectedLike(error) || isAlreadyConnectedLike(errorDescription)) {
      console.log("[auth/callback] already-connected-like error; redirect home", {
        error,
        errorDescription: errorDescription ? String(errorDescription).slice(0, 120) : undefined,
      });
      return redirectResponse;
    }

    return redirectSignin("oauth_error_query");
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      console.log("[auth/callback] exchangeCodeForSession success; redirect home", {
        setCookieNames: redactedCookieNames(redirectResponse.cookies.getAll() as any),
      });

      // Fire Brevo signup event (non-blocking).
      // 5-min window covers slow OAuth round-trips (Google consent, MFA, etc.).
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email?.trim();
        if (email) {
          const createdAt = userData.user?.created_at;
          const isNewUser =
            createdAt && Date.now() - new Date(createdAt).getTime() < 5 * 60_000;
          void brevoUpsertContact(email, {
            SIGNUP_DATE: new Date().toISOString().slice(0, 10),
          });
          if (isNewUser) {
            void brevoTrackEvent(email, "signup", {
              eventProperties: { source: "app", method: "oauth_or_magic_link" },
            });
          }
        }
      } catch {
        /* never block the redirect */
      }

      return redirectResponse;
    }

    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        console.log("[auth/callback] exchangeError but user present; redirect home", {
          exchangeError: String(exchangeError).slice(0, 120),
        });

        // Brevo upsert for returning users that hit the "exchangeError but session" path
        try {
          const email = data.user.email?.trim();
          if (email) {
            void brevoUpsertContact(email, {
              SIGNUP_DATE: new Date().toISOString().slice(0, 10),
            });
          }
        } catch { /* ignore */ }

        return redirectResponse;
      }
    } catch {
      // fall through
    }

    console.log("[auth/callback] exchange failed → signin", {
      exchangeError: exchangeError ? String(exchangeError).slice(0, 120) : undefined,
    });
    return redirectSignin(
      `exchange_failed:${exchangeError ? String(exchangeError).slice(0, 80) : "unknown"}`,
    );
  }

  console.log("[auth/callback] no code in callback URL → signin (open sign-in on app.youry.io, not www)");
  return redirectSignin("missing_code");
}
