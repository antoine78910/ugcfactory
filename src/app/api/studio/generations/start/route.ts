export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioImageModel,
  parseAccountPlan,
  studioImageUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { createStudioKieImageTasks } from "@/lib/studioKieImageTask";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import type { NanoBananaProAspectRatio } from "@/lib/nanobanana";

type Body = {
  kind?: string;
  label?: string;
  accountPlan?: string;
  creditsCharged?: number;
  prompt: string;
  model?: "nano" | "pro";
  aspectRatio?: string;
  resolution?: string;
  numImages?: number;
  personalApiKey?: string;
  /** Reference image URLs (Studio Image tab) — forwarded to Kie. */
  imageUrls?: string[];
};

export async function POST(req: Request) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = (body.kind ?? "avatar").trim() || "avatar";
  const label = (body.label ?? "").trim() || (kind === "avatar" ? "Avatar" : "Studio");
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }

  const model = body.model ?? "nano";
  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey!.trim() : undefined;
  if (
    !personalKey &&
    body.accountPlan != null &&
    String(body.accountPlan).trim() !== ""
  ) {
    const accountPlan = parseAccountPlan(body.accountPlan);
    if (!canUseStudioImageModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error:
            studioImageUpgradeMessage(accountPlan, model) ??
            "Subscription upgrade required for Nano Banana Pro.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const creditsCharged = Math.max(0, Math.floor(Number(body.creditsCharged) || 0));
  const usesPersonalApi = Boolean(personalKey);

  const refUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];

  let taskIds: string[];
  try {
    const created = await createStudioKieImageTasks({
      prompt,
      model,
      numImages: body.numImages ?? 1,
      resolution: (body.resolution as "1K" | "2K" | "4K" | undefined) ?? "1K",
      aspectRatio: (body.aspectRatio as NanoBananaProAspectRatio | undefined) ?? "3:4",
      personalApiKey: body.personalApiKey,
      imageUrls: refUrls.length > 0 ? refUrls : undefined,
    });
    taskIds =
      created.taskIds && created.taskIds.length > 0
        ? created.taskIds
        : created.taskId
          ? [created.taskId]
          : [];
    if (taskIds.length === 0) throw new Error("No task id from provider.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const n = taskIds.length;
  const baseCharge = n > 0 ? Math.floor(creditsCharged / n) : 0;
  const remainder = creditsCharged - baseCharge * n;
  const rowsPayload = taskIds.map((external_task_id, i) => ({
    user_id: user.id,
    kind,
    status: "processing" as const,
    label,
    external_task_id,
    provider: "kie-market",
    credits_charged: baseCharge + (i === 0 ? remainder : 0),
    uses_personal_api: usesPersonalApi,
  }));

  const { data: inserted, error: insErr } = await supabase.from("studio_generations").insert(rowsPayload).select("*");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 502 });
  }

  const rows = (inserted ?? []) as StudioGenerationRow[];
  const first = rows[0];
  return NextResponse.json({
    data: {
      id: first?.id,
      taskId: taskIds[0],
      kind,
      label,
      rows: rows.map((r) => ({ id: r.id, taskId: r.external_task_id })),
    },
  });
}
