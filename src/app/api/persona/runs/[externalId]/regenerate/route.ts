export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import {
  checkPersonaApiAuth,
  normalizeExternalId,
  personaErrorResponseBody,
  regeneratePersonaSlot,
  serializePersonaRun,
} from "@/lib/personaRuns";

type Ctx = { params: Promise<{ externalId: string }> };

/**
 * POST /api/persona/runs/:externalId/regenerate
 * Body: { slot: number } (1-based). A finished image can be regenerated PERSONA_MAX_REGENS_PER_SLOT
 * times (default 1); failed images can always be retried.
 */
export async function POST(req: Request, ctx: Ctx) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });
  try {
    const externalId = normalizeExternalId((await ctx.params).externalId);
    const body = (await req.json().catch(() => null)) as { slot?: unknown } | null;
    const slot = Math.floor(Number(body?.slot));
    if (!Number.isFinite(slot) || slot < 1) {
      return NextResponse.json({ error: "Missing or invalid slot.", code: "bad_request" }, { status: 400 });
    }
    const run = await regeneratePersonaSlot(externalId, slot);
    return NextResponse.json({ data: serializePersonaRun(run) });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}
