export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSupabaseAnonKeyOptional, getSupabaseUrlOptional } from "@/lib/supabase/env";

/**
 * Public Supabase settings for the browser client.
 * Read from process.env at **request time** on Vercel so a new deploy picks up
 * NEXT_PUBLIC_* changes even when the client bundle was built without them.
 * (The anon key is public by design, same exposure as NEXT_PUBLIC_SUPABASE_ANON_KEY.)
 */
export async function GET() {
  const url = getSupabaseUrlOptional() ?? null;
  const anonKey = getSupabaseAnonKeyOptional() ?? null;
  return NextResponse.json(
    { url, anonKey },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
