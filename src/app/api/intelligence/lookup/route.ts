export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { TrendTrackError } from "@/lib/trendtrack";
import { ttLookup } from "@/lib/trendtrack";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { respondTrendTrackError } from "@/app/api/intelligence/_errors";

const TTL = 60 * 60 * 24;

function normalizeLookupQuery(raw: string): string {
  const q = raw.trim();
  if (!q) return "";
  // If user pasted a URL, reduce it to hostname (TrendTrack lookup times out on long URLs).
  try {
    const looksUrl = /^https?:\/\//i.test(q) || q.startsWith("//");
    const u = new URL(looksUrl ? (q.startsWith("//") ? `https:${q}` : q) : `https://${q}`);
    const host = (u.hostname || "").replace(/^www\./i, "").trim();
    return host || q;
  } catch {
    return q.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.trim() || q;
  }
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const rawQ = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!rawQ) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  const q = normalizeLookupQuery(rawQ);
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const key = `lookup:${q.toLowerCase()}`;
  const cached = await getCached(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await ttLookup(q);
    await setCached(key, data, TTL);
    return NextResponse.json(data);
  } catch (err) {
    // Retry once with a narrower query if user pasted a full URL.
    if (err instanceof TrendTrackError && err.status === 504) {
      const fallback = normalizeLookupQuery(rawQ);
      if (fallback && fallback !== q) {
        try {
          const data = await ttLookup(fallback);
          await setCached(`lookup:${fallback.toLowerCase()}`, data, TTL);
          return NextResponse.json(data);
        } catch {
          // fallthrough to structured error below
        }
      }
    }
    return respondTrendTrackError(err, key);
  }
}
