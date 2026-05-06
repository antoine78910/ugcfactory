export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { ttListTrackers } from "@/lib/trendtrack";
import type { TTTracker } from "@/lib/trendtrack";
import { getCached, setCached, deleteCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60;
const WORKSPACE_KEY = "trackers:workspace:list";

type SavedTrackerRow = {
  tracker_id: string;
  name: string;
  logo: string | null;
  domain: string | null;
  created_at: string;
};

export async function GET(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase) return NextResponse.json([]);

  const force = new URL(req.url).searchParams.get("force") === "true";
  if (force) await deleteCached(WORKSPACE_KEY);

  const { data: saved, error } = await supabase
    .from("intelligence_trackers")
    .select("tracker_id, name, logo, domain, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const savedRows = (saved ?? []) as SavedTrackerRow[];
  if (savedRows.length === 0) return NextResponse.json([]);

  try {
    const cachedWorkspace = await getCached<TTTracker[]>(WORKSPACE_KEY);
    const workspace =
      cachedWorkspace ??
      (await (async () => {
        const data = await ttListTrackers();
        await setCached(WORKSPACE_KEY, data, TTL);
        return data;
      })());

    const workspaceById = new Map(
      Array.isArray(workspace) ? workspace.map((t) => [t.id, t] as const) : []
    );

    const out = savedRows.map((r) => {
      const tt = workspaceById.get(r.tracker_id);
      if (tt) {
        return {
          ...tt,
          name: r.name || tt.name,
          domain: r.domain ?? tt.domain,
          logo: r.logo ?? tt.logo,
        };
      }
      return {
        id: r.tracker_id,
        name: r.name,
        domain: r.domain ?? undefined,
        logo: r.logo ?? undefined,
      };
    });

    return NextResponse.json(out);
  } catch (err) {
    return respondTrendTrackError(err, "trackers:workspace:list");
  }
}

export async function POST(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    tracker_id?: string;
    name?: string;
    logo?: string | null;
    domain?: string | null;
  };
  if (!body.tracker_id || !body.name)
    return NextResponse.json({ error: "Missing tracker_id or name" }, { status: 400 });

  const { error } = await supabase.from("intelligence_trackers").upsert({
    user_id: user.id,
    tracker_id: body.tracker_id,
    name: body.name,
    logo: body.logo ?? null,
    domain: body.domain ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, supabase, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user || !supabase)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("tracker_id");
  if (!id) return NextResponse.json({ error: "Missing tracker_id" }, { status: 400 });

  const { error } = await supabase
    .from("intelligence_trackers")
    .delete()
    .eq("user_id", user.id)
    .eq("tracker_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
