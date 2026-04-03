export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";
import { serverLog } from "@/lib/serverLog";

type Body = {
  kind?: string;
  label?: string;
  taskId?: string;
  taskIds?: string[];
  provider?: string;
  creditsCharged?: number;
  personalApiKey?: string;
  piapiApiKey?: string;
  inputUrls?: string[];
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

  if (!kind || taskIds.length === 0) {
    return NextResponse.json({ error: "Missing kind or task id." }, { status: 400 });
  }

  const n = taskIds.length;
  const baseCharge = Math.floor(totalTicks / n);
  const remainder = totalTicks - baseCharge * n;
  const inputUrls = Array.isArray(body.inputUrls)
    ? body.inputUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];

  const payload = taskIds.map((externalTaskId, i) => ({
    user_id: user.id,
    kind,
    status: "processing" as const,
    label,
    external_task_id: externalTaskId,
    provider,
    credits_charged: baseCharge + (i === 0 ? remainder : 0),
    uses_personal_api: usesPersonalApi,
    ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
  }));

  const { data, error } = await supabase.from("studio_generations").insert(payload).select("id, external_task_id");
  if (error) {
    serverLog("studio_generations_register_failed", { kind, count: n, message: error.message });
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const rows = Array.isArray(data) ? data : [];
  serverLog("studio_generations_register_ok", { kind, rows: rows.length, provider });
  return NextResponse.json({
    data: {
      rows: rows.map((r) => ({ id: String(r.id), taskId: String(r.external_task_id) })),
    },
  });
}

