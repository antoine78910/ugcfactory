import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(new URL("/app", url.origin), 302);
    }
  }

  return NextResponse.redirect(new URL("/signin", url.origin), 302);
}

