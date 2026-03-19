import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APP_HOST = "app.youry.io";
const MAIN_HOSTS = new Set(["youry.io", "www.youry.io"]);

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = url;

  // On app.youry.io, serve the app from "/" (rewrite -> /app).
  if (host === APP_HOST) {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals/static files and API routes.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};

