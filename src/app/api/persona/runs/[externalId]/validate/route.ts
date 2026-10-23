export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  checkPersonaApiAuth,
  normalizeExternalId,
  personaErrorResponseBody,
  serializePersonaRun,
  validatePersonaRun,
} from "@/lib/personaRuns";

type Ctx = { params: Promise<{ externalId: string }> };

/** POST /api/persona/runs/:externalId/validate — locks the pack (no more regenerations). */
export async function POST(req: Request, ctx: Ctx) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });
  try {
    const externalId = normalizeExternalId((await ctx.params).externalId);
    const run = await validatePersonaRun(externalId);
    return NextResponse.json({ data: serializePersonaRun(run) });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}
