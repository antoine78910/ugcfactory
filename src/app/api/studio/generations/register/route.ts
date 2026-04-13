export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";
import { serverLog } from "@/lib/serverLog";
import {
  isMissingAspectRatioColumnError,
  isMissingModelColumnError,
} from "@/lib/studioGenerationsSchemaCompat";

type Body = {
  kind?: string;
  label?: string;
  /** Model / picker id stored on the row for history UI. */
  model?: string;
  taskId?: string;
  taskIds?: string[];
  provider?: string;
  creditsCharged?: number;
  personalApiKey?: string;
  piapiApiKey?: string;
  inputUrls?: string[];
  /** Stored for history thumbnail framing (e.g. 16:9, 9:16). */
  aspectRatio?: string;
  /** Register a row that already failed (no taskId needed). */
  status?: "processing" | "failed";
  errorMessage?: string;
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body = {};
  try {
    body = (await req.json().catch(() => ({}))) as Body;
  } catch {
    body = {};
  }

  const kind = String(body.kind ?? "").trim();
  const label = String(body.label ?? "").trim() || "Studio";
  const model = String(body.model ?? "").trim();
  const provider = String(body.provider ?? "kie-market").trim() || "kie-market";
  const creditsDisplay = Math.max(0, Number(body.creditsCharged) || 0);
  const totalTicks = displayCreditsToLedgerTicks(creditsDisplay);
  const hasKiePersonal = Boolean(String(body.personalApiKey ?? "").trim());
  const hasPiapiPersonal = Boolean(String(body.piapiApiKey ?? "").trim());
  const providerLc = provider.toLowerCase();
  /** Do not OR keys across providers — that breaks polling (e.g. KIE key set but PiAPI job never polled). */
  const usesPersonalApi =
    providerLc === "piapi" ? hasPiapiPersonal : hasKiePersonal;
  const taskIdsRaw = Array.isArray(body.taskIds) ? body.taskIds : body.taskId ? [body.taskId] : [];
  const taskIds = taskIdsRaw
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);

  const isFailed = body.status === "failed";
  const errorMessage = String(body.errorMessage ?? "").trim();

  if (!kind) {
    return NextResponse.json({ error: "Missing kind." }, { status: 400 });
  }
  if (!isFailed && taskIds.length === 0) {
    return NextResponse.json({ error: "Missing kind or task id." }, { status: 400 });
  }

  const n = taskIds.length;
  const baseCharge = Math.floor(totalTicks / n);
  const remainder = totalTicks - baseCharge * n;
  const inputUrls = Array.isArray(body.inputUrls)
    ? body.inputUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const aspectRatio = String(body.aspectRatio ?? "").trim();

  if (isFailed && taskIds.length === 0) {
    const single = {
      user_id: user.id,
      kind,
      status: "failed" as const,
      label,
      external_task_id: `failed-${Date.now()}`,
      provider,
      credits_charged: 0,
      uses_personal_api: usesPersonalApi,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(model ? { model } : {}),
    };
    let insertFailedPayload: Record<string, unknown> = { ...single };
    let { data, error } = await supabase
      .from("studio_generations")
      .insert(insertFailedPayload as typeof single)
      .select("id, external_task_id");
    if (error && isMissingAspectRatioColumnError(error.message) && "aspect_ratio" in insertFailedPayload) {
      const { aspect_ratio: _ar, ...rest } = insertFailedPayload;
      insertFailedPayload = rest;
      ({ data, error } = await supabase
        .from("studio_generations")
        .insert(insertFailedPayload as typeof single)
        .select("id, external_task_id"));
    }
    if (error && isMissingModelColumnError(error.message) && "model" in insertFailedPayload) {
      const { model: _m, ...rest } = insertFailedPayload;
      insertFailedPayload = rest;
      ({ data, error } = await supabase
        .from("studio_generations")
        .insert(insertFailedPayload as typeof single)
        .select("id, external_task_id"));
    }
    if (error) {
      serverLog("studio_generations_register_failed", { kind, count: 1, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    serverLog("studio_generations_register_ok", { kind, rows: 1, provider });
    return NextResponse.json({
      data: {
        rows: row ? [{ id: String(row.id), taskId: String(row.external_task_id) }] : [],
      },
    });
  }

  type InsertRow = {
    user_id: string;
    kind: string;
    status: "processing" | "failed";
    label: string;
    external_task_id: string;
    provider: string;
    credits_charged: number;
    uses_personal_api: boolean;
    error_message?: string;
    input_urls?: string[];
    aspect_ratio?: string;
    model?: string;
  };

  const rowsOut: { id: string; taskId: string }[] = [];
  const toInsert: InsertRow[] = [];

  for (let i = 0; i < taskIds.length; i++) {
    const externalTaskId = taskIds[i]!;
    const { data: existing, error: selErr } = await supabase
      .from("studio_generations")
      .select("id")
      .eq("user_id", user.id)
      .eq("external_task_id", externalTaskId)
      .maybeSingle();
    if (selErr) {
      serverLog("studio_generations_register_lookup_failed", { message: selErr.message });
      return NextResponse.json({ error: selErr.message }, { status: 502 });
    }
    if (existing?.id) {
      rowsOut.push({ id: String(existing.id), taskId: externalTaskId });
      continue;
    }
    toInsert.push({
      user_id: user.id,
      kind,
      status: (isFailed ? "failed" : "processing") as "processing" | "failed",
      label,
      external_task_id: externalTaskId,
      provider,
      credits_charged: isFailed ? 0 : baseCharge + (i === 0 ? remainder : 0),
      uses_personal_api: usesPersonalApi,
      ...(isFailed && errorMessage ? { error_message: errorMessage } : {}),
      ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(model ? { model } : {}),
    });
  }

  if (toInsert.length > 0) {
    let batch: InsertRow[] = toInsert;
    let { data, error } = await supabase.from("studio_generations").insert(batch).select("id, external_task_id");
    if (error && isMissingAspectRatioColumnError(error.message)) {
      batch = batch.map(({ aspect_ratio: _a, ...row }) => row);
      ({ data, error } = await supabase.from("studio_generations").insert(batch).select("id, external_task_id"));
    }
    if (error && isMissingModelColumnError(error.message)) {
      batch = batch.map(({ model: _m, ...row }) => row);
      ({ data, error } = await supabase.from("studio_generations").insert(batch).select("id, external_task_id"));
    }
    if (error) {
      serverLog("studio_generations_register_failed", { kind, count: toInsert.length, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const inserted = Array.isArray(data) ? data : [];
    for (const r of inserted) {
      rowsOut.push({ id: String(r.id), taskId: String(r.external_task_id) });
    }
  }

  const idByTaskId = new Map(rowsOut.map((r) => [r.taskId, r.id] as const));
  const rows = taskIds
    .map((tid) => {
      const id = idByTaskId.get(tid);
      return id ? { id, taskId: tid } : null;
    })
    .filter((x): x is { id: string; taskId: string } => x != null);

  serverLog("studio_generations_register_ok", { kind, rows: rows.length, provider });
  return NextResponse.json({ data: { rows } });
}

