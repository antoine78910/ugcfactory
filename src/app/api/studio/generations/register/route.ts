export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { serverLog } from "@/lib/serverLog";

type Body = {
  kind?: string;
  label?: string;
  taskId?: string;
  taskIds?: string[];
  provider?: string;
  model?: string;
  creditsCharged?: number;
  personalApiKey?: string;
  piapiApiKey?: string;
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
  const model = String(body.model ?? "").trim();
  const creditsCharged = Math.max(0, Math.floor(Number(body.creditsCharged) || 0));
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
  const baseCharge = Math.floor(creditsCharged / n);
  const remainder = creditsCharged - baseCharge * n;
  const payload = taskIds.map((externalTaskId, i) => ({
    user_id: user.id,
    kind,
    status: "processing" as const,
    label,
    external_task_id: externalTaskId,
    provider,
    model,
    credits_charged: baseCharge + (i === 0 ? remainder : 0),
    uses_personal_api: usesPersonalApi,
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

