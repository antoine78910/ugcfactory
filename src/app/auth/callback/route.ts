import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const target = new URL("/signin", url.origin);
    if (errorDescription) {
      target.searchParams.set("error_description", errorDescription);
    }
    return NextResponse.redirect(target, 302);
  }

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

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      const target = new URL("/dashboard", url.origin);
      const redirectResponse = NextResponse.redirect(target, 302);
      for (const cookie of cookieCaptureResponse.cookies.getAll()) {
        redirectResponse.cookies.set(cookie);
      }
      return redirectResponse;
    }
  }

  return NextResponse.redirect(new URL("/signin", url.origin), 302);
}

