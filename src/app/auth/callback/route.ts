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

  // Build a mutable response to capture auth cookies set by Supabase.
  const cookieCaptureResponse = NextResponse.next();
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
        // Supabase sends cookiesToSet in the shape: { name, value, options }.
        // Next.js cookie API has changed across versions, so keep this robust.
        try {
          for (const cookie of cookiesToSet as Array<any>) {
            const name = cookie?.name;
            const value = cookie?.value;
            const options = cookie?.options;
            if (typeof name === "string" && typeof value === "string") {
              cookieCaptureResponse.cookies.set(name, value, options as any);
            } else {
              cookieCaptureResponse.cookies.set(cookie as any);
            }
          }
        } catch (e) {
          console.error("[auth/callback] cookies.setAll failed", e);
        }
      },
    },
  });

  async function redirectToAppWithCapturedCookies() {
    const target = new URL("/app", url.origin);
    const redirectResponse = NextResponse.redirect(target, 302);
    for (const cookie of cookieCaptureResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }

    console.log("[auth/callback] redirectToApp", {
      target: target.toString(),
      capturedCookieNames: redactedCookieNames(cookieCaptureResponse.cookies.getAll() as any),
    });

    return redirectResponse;
  }

  async function userExists() {
    const { data } = await supabase.auth.getUser();
    console.log("[auth/callback] userExists()", { exists: Boolean(data?.user) });
    return Boolean(data?.user);
  }

  // If OAuth returned an error but the user session already exists,
  // we shouldn't force them back to /signin.
  if (error) {
    try {
      if (await userExists()) {
        return await redirectToAppWithCapturedCookies();
      }
    } catch {
      // ignore and fall back to /signin
    }

    // Some OAuth flows return "already connected / already authenticated"
    // even though the session is effectively usable. In that case, do not
    // bounce the user to /signin with an error message.
    if (isAlreadyConnectedLike(error) || isAlreadyConnectedLike(errorDescription)) {
      console.log("[auth/callback] already-connected-like error; redirecting to app", {
        error,
        errorDescription: errorDescription ? String(errorDescription).slice(0, 120) : undefined,
      });
      return await redirectToAppWithCapturedCookies();
    }

    const target = new URL("/signin", url.origin);
    if (errorDescription) {
      target.searchParams.set("error_description", errorDescription);
    }
    console.log("[auth/callback] redirectToSignin (oauth error)", {
      target: target.toString(),
    });
    return NextResponse.redirect(target, 302);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      console.log("[auth/callback] exchangeCodeForSession success; redirecting to app");
      return await redirectToAppWithCapturedCookies();
    }

    // Some OAuth errors (ex: already authenticated) shouldn't block the redirect.
    try {
      if (await userExists()) {
        console.log("[auth/callback] exchangeError but user exists; redirecting to app", {
          exchangeError: String(exchangeError).slice(0, 120),
        });
        return await redirectToAppWithCapturedCookies();
      }
    } catch {
      // ignore
    }

    console.log("[auth/callback] redirectToSignin (exchange failed)", {
      exchangeError: exchangeError ? String(exchangeError).slice(0, 120) : undefined,
      cookieNamesAfterExchange: redactedCookieNames(cookieCaptureResponse.cookies.getAll() as any),
    });
  }

  console.log("[auth/callback] final redirectToSignin (no code or cannot auth)");
  return NextResponse.redirect(new URL("/signin", url.origin), 302);
}

