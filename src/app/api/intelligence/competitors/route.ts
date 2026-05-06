export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type CompetitorRow = {
  id: string;
  lookup_id: string | null;
  name: string;
  domain: string | null;
  created_at: string;
};

export type IntelligenceCompetitor = {
  id: string;
  lookupId: string | null;
  name: string;
  domain: string | null;
  createdAt: string;
};

export async function GET() {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("intelligence_competitors")
    .select("id, lookup_id, name, domain, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as CompetitorRow[];
  const out: IntelligenceCompetitor[] = rows.map((r) => ({
    id: r.id,
    lookupId: r.lookup_id,
    name: r.name,
    domain: r.domain,
    createdAt: r.created_at,
  }));
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    lookupId?: unknown;
    name?: unknown;
    domain?: unknown;
  };

  const lookupId = typeof body.lookupId === "string" ? body.lookupId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  // Best-effort dedupe: if lookupId exists, upsert on unique index (user_id, lookup_id).
  const payload = {
    user_id: user.id,
    lookup_id: lookupId || null,
    name,
    domain: domain || null,
  };

  const { data, error } = await supabase
    .from("intelligence_competitors")
    // When lookup_id is null, upsert behaves like insert (no conflict target).
    .upsert(payload, lookupId ? { onConflict: "user_id,lookup_id" } : undefined)
    .select("id, lookup_id, name, domain, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as CompetitorRow;
  return NextResponse.json({
    id: row.id,
    lookupId: row.lookup_id,
    name: row.name,
    domain: row.domain,
    createdAt: row.created_at,
  } satisfies IntelligenceCompetitor);
}

