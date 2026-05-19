export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { fetchStartLinkStats, type StartLinkStatsPeriod } from "@/lib/analytics/startLinkStats";

function parsePeriod(raw: string | null): StartLinkStatsPeriod {
  if (raw === "7d" || raw === "30d" || raw === "all") return raw;
  return "30d";
}

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const period = parsePeriod(searchParams.get("period"));

  const stats = await fetchStartLinkStats(period);
  return NextResponse.json(stats);
}
