import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

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

  /**
   * Session cookies from `exchangeCodeForSession` MUST be set on the same
   * NextResponse that we return. Copying via `getAll()` from another response
   * fails in Next.js 15+: programmatic cookies are not reliably readable back,
   * and `set(cookie)` drops path/httpOnly/sameSite — so the browser never
   * stores the session and the next request hits `/` unauthenticated → /signin.
   */
  let redirectResponse = NextResponse.redirect(homeUrl, 302);

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
            redirectResponse.cookies.set(name, value, options);
          }
        } catch (e) {
          console.error("[auth/callback] cookies.setAll failed", e);
        }
      },
    },
  });

  function redirectSignin() {
    if (errorDescription) {
      signinUrl.searchParams.set("error_description", errorDescription);
    }
    console.log("[auth/callback] redirectToSignin", { target: signinUrl.toString() });
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

    return redirectSignin();
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      console.log("[auth/callback] exchangeCodeForSession success; redirect home", {
        setCookieNames: redactedCookieNames(redirectResponse.cookies.getAll() as any),
      });
      return redirectResponse;
    }

    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        console.log("[auth/callback] exchangeError but user present; redirect home", {
          exchangeError: String(exchangeError).slice(0, 120),
        });
        return redirectResponse;
      }
    } catch {
      // fall through
    }

    console.log("[auth/callback] exchange failed → signin", {
      exchangeError: exchangeError ? String(exchangeError).slice(0, 120) : undefined,
    });
    return redirectSignin();
  }

  console.log("[auth/callback] no code and no usable error handler → signin");
  return redirectSignin();
}
