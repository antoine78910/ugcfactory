export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import {
  checkPersonaApiAuth,
  createPersonaRun,
  listPersonaRunIds,
  loadPersonaRun,
  normalizeExternalId,
  parseGender,
  personaErrorResponseBody,
  serializePersonaRun,
} from "@/lib/personaRuns";

/**
 * POST /api/persona/runs
 * Auth: Authorization: Bearer <PERSONA_API_SECRET>
 * Body: { externalId: string, gender: "femme" | "homme", selfieUrl: string, meta?: object }
 * Starts the Corpo Girl branch for this user (one run per externalId, ever, unless reset).
 */
export async function POST(req: Request) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
    const externalId = normalizeExternalId(String(body.externalId ?? ""));
    const gender = parseGender(body.gender);
    const selfieUrl = String(body.selfieUrl ?? "").trim();
    if (!selfieUrl) return NextResponse.json({ error: "Missing selfieUrl.", code: "bad_request" }, { status: 400 });
    const meta = body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : {};
    const run = await createPersonaRun({ externalId, gender, selfieUrl, meta });
    return NextResponse.json({ data: serializePersonaRun(run) }, { status: 201 });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * GET /api/persona/runs?status=generating
 * Lists runs (optionally filtered by status) so the bot can resume polling after a restart.
 * Does not refresh provider tasks; call GET /api/persona/runs/:externalId for that.
 */
export async function GET(req: Request) {
  const authErr = checkPersonaApiAuth(req);
  if (authErr) return NextResponse.json({ error: authErr.message, code: authErr.code }, { status: authErr.status });

  try {
    const wanted = new URL(req.url).searchParams.get("status")?.trim() || null;
    const ids = await listPersonaRunIds();
    const runs = [];
    for (const id of ids) {
      const run = await loadPersonaRun(id);
      if (!run) continue;
      if (wanted && run.status !== wanted) continue;
      runs.push({
        externalId: run.externalId,
        gender: run.gender,
        status: run.status,
        meta: run.meta,
        updatedAt: run.updatedAt,
      });
    }
    return NextResponse.json({ data: runs });
  } catch (err) {
    const { status, body } = personaErrorResponseBody(err);
    return NextResponse.json(body, { status });
  }
}
