export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { pollStudioGenerationRow } from "@/lib/studioGenerationsPoll";
import { serverLog } from "@/lib/serverLog";

type AnyObj = Record<string, unknown>;

function extractTaskId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const o = payload as AnyObj;
  const direct = o.taskId ?? o.task_id ?? o.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const data = o.data;
  if (data && typeof data === "object") {
    const d = data as AnyObj;
    const t = d.taskId ?? d.task_id ?? d.id;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

/**
 * KIE Market callback endpoint.
 *
 * We don't rely on the callback payload shape; we only need the task id, then we
 * re-poll KIE via our existing polling logic and persist to `studio_generations`.
 *
 * Auth: optional shared secret via query param `t`.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t")?.trim() ?? "";
  const expected = getEnv("KIE_CALLBACK_SECRET")?.trim() ?? "";
  if (expected && token !== expected) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = await req.json().catch(() => null);
  } catch {
    payload = null;
  }

  const taskId = extractTaskId(payload);
  if (!taskId) {
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  try {
    const { data: row } = await admin
      .from("studio_generations")
      .select("*")
      .eq("external_task_id", taskId)
      .maybeSingle();

    if (row) {
      await pollStudioGenerationRow(row as StudioGenerationRow, undefined, undefined, admin);
    }
  } catch (e) {
    serverLog("kie_callback_poll_failed", {
      taskId,
      message: e instanceof Error ? e.message.slice(0, 240) : String(e ?? "").slice(0, 240),
    });
  }

  return NextResponse.json({ status: "received" }, { status: 200 });
}

