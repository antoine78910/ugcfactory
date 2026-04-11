export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSupabaseUrlOptional } from "@/lib/supabase/env";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN: process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN || null,
    resolvedSupabaseUrl: getSupabaseUrlOptional() ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_PRESENT: Boolean(anonKey),
  });
}

