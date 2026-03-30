import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APP_HOST = "app.youry.io";
const MAIN_HOSTS = new Set(["youry.io", "www.youry.io"]);

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

  // On app.youry.io, serve the app from "/" (rewrite -> /app).
  if (host === APP_HOST) {
    if (pathname === "/" && hasAuthParams) {
      url.pathname = "/auth/callback";
      return NextResponse.redirect(url, 307);
    }
    if (pathname === "/") {
      url.pathname = "/app";
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

