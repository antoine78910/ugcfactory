export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import {
  checkPersonaApiAuth,
  deletePersonaRun,
  normalizeExternalId,
  personaErrorResponseBody,
  refreshPersonaRun,
  serializePersonaRun,
} from "@/lib/personaRuns";

type Ctx = { params: Promise<{ externalId: string }> };

/** GET /api/persona/runs/:externalId — refreshes pending images, returns the run. */
export async function GET(req: Request, ctx: Ctx) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });
  try {
    const externalId = normalizeExternalId((await ctx.params).externalId);
    const run = await refreshPersonaRun(externalId);
    return NextResponse.json({ data: serializePersonaRun(run) });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/persona/runs/:externalId — staff reset, lets the user start a new (paid) run. */
export async function DELETE(req: Request, ctx: Ctx) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });
  try {
    const externalId = normalizeExternalId((await ctx.params).externalId);
    const deleted = await deletePersonaRun(externalId);
    return NextResponse.json({ data: { deleted } });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}
