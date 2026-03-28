import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APP_HOST = "app.youry.io";
const MAIN_HOSTS = new Set(["youry.io", "www.youry.io"]);

export function middleware(req: NextRequest) {
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
    // OAuth / magic links often land on the site root (?code= / ?error= / ?token_hash=).
    // Never rewrite those to /app — the session is created in /auth/callback only.
    if (pathname === "/" && hasAuthParams) {
      url.pathname = "/auth/callback";
      return NextResponse.redirect(url, 307);
    }
    if (pathname === "/") {
      url.pathname = "/app";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Sentry tunnel (ad-blocker bypass), API, Next internals, static files.
    "/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};

