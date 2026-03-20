import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Build a mutable response to capture auth cookies set by Supabase.
  const cookieCaptureResponse = NextResponse.next();
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieCaptureResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  async function redirectToAppWithCapturedCookies() {
    const target = new URL("/dashboard", url.origin);
    const redirectResponse = NextResponse.redirect(target, 302);
    for (const cookie of cookieCaptureResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  async function userExists() {
    const { data } = await supabase.auth.getUser();
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

    const target = new URL("/signin", url.origin);
    if (errorDescription) {
      target.searchParams.set("error_description", errorDescription);
    }
    return NextResponse.redirect(target, 302);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return await redirectToAppWithCapturedCookies();
    }

    // Some OAuth errors (ex: already authenticated) shouldn't block the redirect.
    try {
      if (await userExists()) {
        return await redirectToAppWithCapturedCookies();
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.redirect(new URL("/signin", url.origin), 302);
}

