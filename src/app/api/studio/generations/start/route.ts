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

  let taskId: string;
  try {
    const created = await createStudioKieImageTasks({
      prompt,
      model,
      numImages: body.numImages ?? 1,
      resolution: (body.resolution as "1K" | "2K" | "4K" | undefined) ?? "1K",
      aspectRatio: (body.aspectRatio as "auto" | "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | undefined) ?? "3:4",
      personalApiKey: body.personalApiKey,
    });
    const tid = created.taskId ?? created.taskIds?.[0];
    if (!tid) throw new Error("No task id from provider.");
    taskId = tid;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("studio_generations")
    .insert({
      user_id: user.id,
      kind,
      status: "processing",
      label,
      external_task_id: taskId,
      provider: "kie-market",
      credits_charged: creditsCharged,
      uses_personal_api: usesPersonalApi,
    })
    .select("*")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 502 });
  }

  const row = inserted as StudioGenerationRow;
  return NextResponse.json({
    data: {
      id: row.id,
      taskId,
      kind: row.kind,
      label: row.label,
    },
  });
}
