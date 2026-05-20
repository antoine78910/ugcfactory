import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { processDueOnboardingCalReminders } from "@/lib/onboardingCalReminders";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getCronSecret(): string {
  return (
    getEnv("ONBOARDING_CAL_REMINDER_CRON_SECRET")?.trim() ||
    getEnv("CRON_SECRET")?.trim() ||
    ""
  );
}

function cronAuthorized(req: Request, secret: string): boolean {
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  try {
    const a = Buffer.from(bearer);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Hourly (or external) cron: sends T-12h confirmation emails.
 * Authorization: Bearer <ONBOARDING_CAL_REMINDER_CRON_SECRET or CRON_SECRET>
 */
export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}

async function handleCron(req: Request) {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json({ error: "Cron secret not configured." }, { status: 503 });
  }
  if (!cronAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const result = await processDueOnboardingCalReminders(admin);
  return NextResponse.json({ ok: true, ...result });
}
