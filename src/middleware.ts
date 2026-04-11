import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APP_HOST = "app.youry.io";
const MAIN_HOSTS = new Set(["youry.io", "www.youry.io"]);

function isStudioHost(hostHeader: string): boolean {
  const host = hostHeader.split(":")[0].toLowerCase();
  return host === APP_HOST || host === "localhost" || host.startsWith("127.0.0.1");
}

/** Routes that have their own `src/app/<name>` pages — do not rewrite to `/app/*`. */
function isExcludedFromStudioRewrite(pathname: string): boolean {
  if (pathname.startsWith("/auth")) return true;
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return new Set([
    "subscription",
    "credits",
    "signin",
    "signup",
    "support",
    "subscriptions",
    "dashboard",
    "admin",
    "apitest",
    /** Gift / promo credit links — must not rewrite or `[...sections]` swallows `/redeem` and shows Link to Ad. */
    "redeem",
    /** Top-level `src/app/workflow/*` — must not rewrite to `/app/workflow` or `[...sections]` treats it as unknown and shows Link to Ad. */
    "workflow",
  ]).has(first);
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = url;
  const hasAuthParams =
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token") ||
    url.searchParams.has("token_hash") ||
    url.searchParams.has("type");

  // App subdomain (and local dev): browser URLs have no `/app` prefix; rewrite into `/app/*` catch-all.
  if (isStudioHost(host)) {
    if (pathname === "/" && hasAuthParams) {
      url.pathname = "/auth/callback";
      return NextResponse.redirect(url, 307);
    }

    // Canonicalize legacy `/app/...` URLs to `/...` (subdomain already says "app").
    if (pathname === "/app" || pathname === "/app/") {
      url.pathname = "/";
      return NextResponse.redirect(url, 308);
    }
    if (pathname.startsWith("/app/")) {
      url.pathname = pathname.slice(4) || "/";
      return NextResponse.redirect(url, 308);
    }

    if (pathname === "/") {
      url.pathname = "/app";
      return NextResponse.rewrite(url);
    }

    if (!isExcludedFromStudioRewrite(pathname)) {
      url.pathname = "/app" + pathname;
      return NextResponse.rewrite(url);
    }
  }

  // On main marketing domain, redirect /app* to app.youry.io.
  if (MAIN_HOSTS.has(host) && pathname.startsWith("/app")) {
    const target = req.nextUrl.clone();
    target.protocol = "https";
    target.host = APP_HOST;
    target.pathname = pathname === "/app" ? "/" : pathname.replace(/^\/app/, "");
    return NextResponse.redirect(target, 308);
  }

  // OAuth fallback: if auth params land on main domain root, forward to app subdomain.
  if (MAIN_HOSTS.has(host) && hasAuthParams) {
    const target = req.nextUrl.clone();
    target.protocol = "https";
    target.host = APP_HOST;
    return NextResponse.redirect(target, 308);
  }

  /**
   * Sign-in / sign-up / auth callbacks must run on the app host (`app.youry.io`).
   * Supabase PKCE stores `code_verifier` in a host-scoped cookie. If the user starts
   * Google OAuth on `www.youry.io/signin` but the callback hits `app.youry.io/auth/callback`,
   * `exchangeCodeForSession` fails (no verifier) and they bounce to /signin forever.
   */
  if (MAIN_HOSTS.has(host)) {
    const first = pathname.split("/").filter(Boolean)[0] ?? "";
    if (first === "signin" || first === "signup" || first === "auth") {
      const target = req.nextUrl.clone();
      target.protocol = "https";
      target.host = APP_HOST;
      return NextResponse.redirect(target, 308);
    }
  }

  // Keep the marketing landing page cache-friendly and eligible for bfcache.
  if (MAIN_HOSTS.has(host) && pathname === "/") {
    return NextResponse.next();
  }

  // Refresh the Supabase session on every request so Server Components always
  // receive a valid access token (tokens expire after ~1 hour without this).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    let response = NextResponse.next({ request: req });
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
            response = NextResponse.next({ request: req });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      });
      // getUser() refreshes the token if expired and writes the new cookie via setAll.
      await supabase.auth.getUser();
    } catch {
      /* non-fatal — continue without refresh */
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Sentry tunnel (ad-blocker bypass), API, Next internals, static files.
    "/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};

