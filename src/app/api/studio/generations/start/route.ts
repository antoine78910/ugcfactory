export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioImagePickerModel,
  parseAccountPlan,
  studioImagePickerUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { createStudioKieImageTasks } from "@/lib/studioKieImageTask";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import type { NanoBananaProAspectRatio } from "@/lib/nanobanana";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";
import { studioImageCreditsChargedTotal } from "@/lib/pricing";
import { isStudioImageKiePickerModelId } from "@/lib/studioImageModels";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

/** Calculate credits server-side; never trust the client-provided value. */
function computeImageCredits(model: string, resolution: string, numImages: number): number {
  const res =
    resolution === "4K" || resolution === "2K" || resolution === "1K" ? resolution : "1K";
  return studioImageCreditsChargedTotal({
    studioModel: model,
    resolution: res,
    numImages,
  });
}

type Body = {
  kind?: string;
  label?: string;
  accountPlan?: string;
  prompt: string;
  model?: string;
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

  const rawModel = body.model ?? "nano";
  const model = typeof rawModel === "string" ? rawModel.trim() : "nano";
  if (!isStudioImageKiePickerModelId(model)) {
    return NextResponse.json({ error: "Invalid image model." }, { status: 400 });
  }
  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey!.trim() : undefined;
  if (!personalKey) {
    const dbPlan = await getUserPlan(user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    if (!canUseStudioImagePickerModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error:
            studioImagePickerUpgradeMessage(accountPlan, model) ??
            "Subscription upgrade required for this image model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const usesPersonalApi = Boolean(personalKey);
  // Calculate credits server-side — never trust the client-provided value
  const numImages = Math.max(1, Math.min(Number(body.numImages) || 1, 10));
  const resolution = (body.resolution as "1K" | "2K" | "4K" | undefined) ?? "1K";
  const creditsDisplay = usesPersonalApi ? 0 : computeImageCredits(model, resolution, numImages);
  const totalTicks = displayCreditsToLedgerTicks(creditsDisplay);

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
    logGenerationFailure("studio/generations/start", err, { kind });
    const message = err instanceof Error ? err.message : "Generate failed.";
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }

  const n = taskIds.length;
  const baseCharge = n > 0 ? Math.floor(totalTicks / n) : 0;
  const remainder = totalTicks - baseCharge * n;
  const inputUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];

  const rowsPayload = taskIds.map((external_task_id, i) => ({
    user_id: user.id,
    kind,
    status: "processing" as const,
    label,
    external_task_id,
    provider: "kie-market",
    credits_charged: baseCharge + (i === 0 ? remainder : 0),
    uses_personal_api: usesPersonalApi,
    ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
  }));

  const { data: inserted, error: insErr } = await supabase.from("studio_generations").insert(rowsPayload).select("*");

  if (insErr) {
    logGenerationFailure("studio/generations/start", insErr, { kind, step: "insert" });
    return NextResponse.json({ error: "Could not save your generation job. Please try again." }, { status: 502 });
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
