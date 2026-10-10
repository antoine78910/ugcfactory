import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

type EeUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

function bearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim() ?? "";
  return token.length > 20 ? token : null;
}

function alreadyRegistered(message: string | undefined): boolean {
  const s = (message ?? "").toLowerCase();
  return s.includes("already") || s.includes("registered") || s.includes("exists");
}

/**
 * Trade an Ecom Efficiency creator access token for a Youry session
 * marked as a creator (influencer tools).
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const eeUrl = getEnv("EE_SUPABASE_URL");
  const eeAnon = getEnv("EE_SUPABASE_ANON_KEY");
  if (!eeUrl || !eeAnon) {
    return NextResponse.json({ error: "ee_not_configured" }, { status: 503 });
  }

  const ee = createClient(eeUrl, eeAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: eeAuth, error: eeError } = await ee.auth.getUser(token);
  const eeUser = eeAuth.user as EeUser | null;
  if (eeError || !eeUser?.id) {
    return NextResponse.json({ error: "invalid_ee_session" }, { status: 401 });
  }

  const kind = String(eeUser.app_metadata?.account_kind ?? "").trim().toLowerCase();
  if (kind !== "creator") {
    return NextResponse.json({ error: "not_creator" }, { status: 403 });
  }

  const email = eeUser.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "youry_admin_unavailable" }, { status: 503 });
  }

  const creatorMeta = {
    influencer: true,
    account_kind: "creator",
    ee_user_id: eeUser.id,
  };

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: creatorMeta,
    user_metadata: { account_kind: "creator" },
  });

  if (created.error && !alreadyRegistered(created.error.message)) {
    console.error("[auth/ee-creator] createUser:", created.error.message);
    return NextResponse.json({ error: "could_not_provision" }, { status: 500 });
  }

  const linked = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linked.data?.properties?.hashed_token;
  const linkedUser = linked.data?.user;
  if (linked.error || !tokenHash || !linkedUser?.id) {
    console.error("[auth/ee-creator] generateLink:", linked.error?.message);
    return NextResponse.json({ error: "could_not_sign_in" }, { status: 500 });
  }

  if (created.error) {
    const existing = (linkedUser.app_metadata ?? {}) as Record<string, unknown>;
    const { error: updateError } = await admin.auth.admin.updateUserById(linkedUser.id, {
      app_metadata: { ...existing, ...creatorMeta },
    });
    if (updateError) {
      console.error("[auth/ee-creator] updateUser:", updateError.message);
      return NextResponse.json({ error: "could_not_sync" }, { status: 500 });
    }
  }

  // Cookies must be written on this response. next/headers cookies()
  // does not reliably attach httpOnly session cookies to a JSON response.
  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          req.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpError) {
    console.error("[auth/ee-creator] verifyOtp:", otpError.message);
    return NextResponse.json({ error: "could_not_sign_in" }, { status: 500 });
  }

  return response;
}
