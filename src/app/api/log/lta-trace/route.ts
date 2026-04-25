export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { serverLog } from "@/lib/serverLog";

type Body = {
  traceId?: string;
  event?: string;
} & Record<string, unknown>;

/**
 * Lightweight client → server beacon for tracing the Link to Ad "Generate 3 images" flow.
 * Mirrors what's happening on the client into the Next.js terminal/log so we can see whether the
 * click reached the handler, which exit path was taken, and whether `/api/nanobanana/generate` was
 * reached. No auth/credits/etc. — this is purely diagnostic and very cheap.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* ignore – tracing must never fail */
  }
  const event = typeof body.event === "string" && body.event ? body.event : "unknown";
  const traceId = typeof body.traceId === "string" && body.traceId ? body.traceId : null;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "event" || k === "traceId") continue;
    rest[k] = v;
  }
  serverLog(`lta_trace:${event}`, { traceId, ...rest });
  return NextResponse.json({ ok: true });
}
