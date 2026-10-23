/**
 * Persona runs: server-side "Play" of the Corpo Girl workflow for external clients (JobShift Discord bot).
 *
 * Flow:
 *   1. Client POSTs a selfie URL + gender ("femme" | "homme") for an external user id (Discord id).
 *   2. We rehost the selfie, read the Corpo Girl workflow space, and start one Kie image task per
 *      generator of the chosen branch ("Femme génération" / "Homme Génération"), replacing the root
 *      selfie reference with the uploaded one (reference order kept: [pose, selfie]).
 *   3. Client polls GET; each poll refreshes pending Kie tasks and copies finished images to Storage.
 *   4. Client may regenerate a slot (limited per slot), then validates the pack.
 *
 * State lives as one JSON object per external id in a private Storage bucket (no DB migration),
 * which also enforces "one run per user" across bot redeploys.
 */
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { createStudioKieImageTasks } from "@/lib/studioKieImageTask";
import {
  extractKieMediaUrls,
  kieMarketRecordInfo,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
} from "@/lib/kieMarket";
import type { StudioImageKiePickerModelId } from "@/lib/studioImageModels";
import type { NanoBananaProAspectRatio, NanoBananaProResolution } from "@/lib/nanobanana";
import { serverLog } from "@/lib/serverLog";

export type PersonaGender = "femme" | "homme";
export type PersonaSlotStatus = "pending" | "done" | "failed";
export type PersonaRunStatus = "generating" | "ready" | "validated";

export type PersonaSlot = {
  index: number;
  generatorNodeId: string;
  poseImageUrl: string;
  prompt: string;
  imageUrls: string[];
  model: string;
  resolution: string;
  aspectRatio: string;
  taskId: string | null;
  status: PersonaSlotStatus;
  imageUrl: string | null;
  error: string | null;
  /** Automatic retries after provider failures (not charged to the user's regen allowance). */
  autoRetries: number;
  /** User-requested regenerations. */
  regenerations: number;
  startedAt: string;
};

export type PersonaRun = {
  version: 1;
  externalId: string;
  gender: PersonaGender;
  status: PersonaRunStatus;
  selfieUrl: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
  meta: Record<string, unknown>;
  slots: PersonaSlot[];
};

const RUNS_BUCKET = "persona-runs";
const MEDIA_BUCKET = "ugc-uploads";
const DEFAULT_SPACE_ID = "08d5d5c7-409a-44a0-8843-66ec5ed9d08b";
const MAX_SELFIE_BYTES = 15 * 1024 * 1024;
const MAX_AUTO_RETRIES = 2;
const SLOT_TIMEOUT_MS = 12 * 60 * 1000;
/** Kie rejects bursts ("call frequency is too high"), so starts are throttled and retried. */
const TASK_START_CONCURRENCY = 3;
const TASK_START_RETRY_DELAYS_MS = [2000, 5000, 10000];
const REFRESH_CONCURRENCY = 6;

export class PersonaError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request",
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Returns null when authorized, or an error to send back. */
export function checkPersonaApiAuth(req: Request): PersonaError | null {
  const secret = getEnv("PERSONA_API_SECRET");
  if (!secret) return new PersonaError("PERSONA_API_SECRET not configured.", 503, "not_configured");
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(bearer);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new PersonaError("Unauthorized", 401, "unauthorized");
  }
  return null;
}

export function maxRegensPerSlot(): number {
  const raw = Number(getEnv("PERSONA_MAX_REGENS_PER_SLOT") ?? "1");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1;
}

export function normalizeExternalId(raw: string): string {
  const id = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new PersonaError("Invalid externalId (letters, digits, _ and - only).", 400, "invalid_external_id");
  }
  return id;
}

export function parseGender(raw: unknown): PersonaGender {
  const g = String(raw ?? "").trim().toLowerCase();
  if (g === "femme" || g === "female" || g === "woman" || g === "f") return "femme";
  if (g === "homme" || g === "male" || g === "man" || g === "m") return "homme";
  throw new PersonaError('Invalid gender. Use "femme" or "homme".', 400, "invalid_gender");
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function admin() {
  const client = createSupabaseServiceClient();
  if (!client) throw new PersonaError("SUPABASE_SERVICE_ROLE_KEY not configured.", 503, "not_configured");
  return client;
}

let bucketReady = false;

async function ensureRunsBucket(): Promise<void> {
  if (bucketReady) return;
  const sb = admin();
  const { error } = await sb.storage.getBucket(RUNS_BUCKET);
  if (error) {
    const { error: createErr } = await sb.storage.createBucket(RUNS_BUCKET, { public: false });
    if (createErr && !/already exists/i.test(createErr.message)) {
      throw new PersonaError(`Could not create storage bucket: ${createErr.message}`, 502, "storage");
    }
  }
  bucketReady = true;
}

function runPath(externalId: string): string {
  return `runs/${externalId}.json`;
}

export async function loadPersonaRun(externalId: string): Promise<PersonaRun | null> {
  await ensureRunsBucket();
  const { data, error } = await admin().storage.from(RUNS_BUCKET).download(runPath(externalId));
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as PersonaRun;
  } catch {
    return null;
  }
}

export async function savePersonaRun(run: PersonaRun): Promise<void> {
  await ensureRunsBucket();
  run.updatedAt = new Date().toISOString();
  const body = Buffer.from(JSON.stringify(run), "utf-8");
  const { error } = await admin()
    .storage.from(RUNS_BUCKET)
    .upload(runPath(run.externalId), body, { contentType: "application/json", upsert: true });
  if (error) throw new PersonaError(`Could not save persona run: ${error.message}`, 502, "storage");
}

export async function deletePersonaRun(externalId: string): Promise<boolean> {
  await ensureRunsBucket();
  const existing = await loadPersonaRun(externalId);
  if (!existing) return false;
  const { error } = await admin().storage.from(RUNS_BUCKET).remove([runPath(externalId)]);
  if (error) throw new PersonaError(`Could not delete persona run: ${error.message}`, 502, "storage");
  return true;
}

export async function listPersonaRunIds(): Promise<string[]> {
  await ensureRunsBucket();
  const { data, error } = await admin().storage.from(RUNS_BUCKET).list("runs", { limit: 1000 });
  if (error || !data) return [];
  return data
    .map((f) => f.name)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length));
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Download a remote image and store it in the public media bucket. Returns the public URL. */
async function rehostImage(sourceUrl: string, folder: string, name: string): Promise<string> {
  if (!/^https:\/\//i.test(sourceUrl)) throw new PersonaError("Image URL must be https.", 400, "invalid_url");
  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) throw new PersonaError(`Could not download image (HTTP ${res.status}).`, 400, "download_failed");
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new PersonaError("Downloaded image is empty.", 400, "download_failed");
  if (buf.length > MAX_SELFIE_BYTES) throw new PersonaError("Image too large (max 15 MB).", 413, "too_large");
  const ext = EXT_BY_TYPE[contentType] ?? (contentType.startsWith("image/") ? "jpg" : null);
  if (!ext) throw new PersonaError("The file is not an image (jpg, png or webp).", 400, "not_image");

  const path = `${folder}/${name}-${crypto.randomUUID()}.${ext}`;
  const sb = admin();
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, buf, {
    contentType: contentType || "image/jpeg",
    upsert: false,
  });
  if (error) throw new PersonaError(`Could not store image: ${error.message}`, 502, "storage");
  return sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// Workflow plan (read Corpo Girl state)
// ---------------------------------------------------------------------------

type WfNode = {
  id: string;
  type?: string;
  parentId?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};
type WfEdge = { source: string; target: string; targetHandle?: string | null };

type PlannedSlot = Pick<
  PersonaSlot,
  "index" | "generatorNodeId" | "poseImageUrl" | "prompt" | "imageUrls" | "model" | "resolution" | "aspectRatio"
>;

function normLabel(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function workflowResolutionToKie(r: unknown): NanoBananaProResolution {
  const s = String(r ?? "").trim().toUpperCase();
  if (s === "2048" || s === "2K") return "2K";
  if (s === "4096" || s === "4K") return "4K";
  return "1K";
}

export async function planPersonaSlots(gender: PersonaGender, selfieUrl: string): Promise<{
  spaceId: string;
  slots: PlannedSlot[];
}> {
  const spaceId = getEnv("PERSONA_WORKFLOW_SPACE_ID") ?? DEFAULT_SPACE_ID;
  const { data, error } = await admin().from("workflow_spaces").select("state").eq("id", spaceId).maybeSingle();
  if (error || !data) throw new PersonaError("Persona workflow space not found.", 500, "workflow_missing");

  const state = data.state as { pages?: { nodes?: WfNode[]; edges?: WfEdge[] }[] };
  const pages = Array.isArray(state?.pages) ? state.pages : [];
  const nodes = pages.flatMap((p) => p.nodes ?? []);
  const edges = pages.flatMap((p) => p.edges ?? []);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const groups = nodes.filter((n) => n.type === "workflowGroup");
  const poseGroup = groups.find((g) => normLabel(g.data?.label) === gender);
  const genGroup = groups.find((g) => {
    const l = normLabel(g.data?.label);
    return l.startsWith(gender) && l.includes("gener");
  });
  if (!poseGroup || !genGroup) {
    throw new PersonaError(`Workflow groups for "${gender}" not found.`, 500, "workflow_missing");
  }

  const generators = nodes
    .filter((n) => n.type === "adAsset" && n.parentId === genGroup.id && n.data?.kind === "image")
    .sort((a, b) => {
      const ay = a.position?.y ?? 0;
      const by = b.position?.y ?? 0;
      return ay !== by ? ay - by : (a.position?.x ?? 0) - (b.position?.x ?? 0);
    });

  const slots: PlannedSlot[] = [];
  for (const gen of generators) {
    const incoming = edges.filter((e) => e.target === gen.id);
    const refs: string[] = [];
    let poseImageUrl = "";
    const prompts: string[] = [];
    for (const e of incoming) {
      const src = byId.get(e.source);
      if (!src) continue;
      const handle = e.targetHandle ?? "in";
      if ((handle === "references" || handle === "inImage") && src.type === "imageRef") {
        const isPose = src.parentId === poseGroup.id;
        const url = isPose ? String(src.data?.imageUrl ?? "").trim() : selfieUrl;
        if (!url || refs.includes(url)) continue;
        refs.push(url);
        if (isPose && !poseImageUrl) poseImageUrl = url;
      } else if ((handle === "text" || handle === "inText") && src.type === "textPrompt") {
        const p = String(src.data?.prompt ?? "").trim();
        if (p) prompts.push(p);
      }
    }
    if (!refs.includes(selfieUrl)) refs.push(selfieUrl);
    const prompt = prompts.join("\n\n") || String(gen.data?.prompt ?? "").trim();
    if (!prompt || !poseImageUrl) continue;
    slots.push({
      index: slots.length + 1,
      generatorNodeId: gen.id,
      poseImageUrl,
      prompt,
      imageUrls: refs,
      model: String(gen.data?.model ?? "nano") || "nano",
      resolution: workflowResolutionToKie(gen.data?.resolution),
      aspectRatio: String(gen.data?.aspectRatio ?? "auto") || "auto",
    });
  }
  if (slots.length === 0) throw new PersonaError("No generators found in the workflow branch.", 500, "workflow_empty");
  return { spaceId, slots };
}

// ---------------------------------------------------------------------------
// Kie tasks
// ---------------------------------------------------------------------------

async function startSlotTask(slot: PersonaSlot): Promise<void> {
  slot.startedAt = new Date().toISOString();
  let lastError = "";
  for (let attempt = 0; attempt <= TASK_START_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, TASK_START_RETRY_DELAYS_MS[attempt - 1]));
    try {
      const created = await createStudioKieImageTasks({
        prompt: slot.prompt,
        model: slot.model as StudioImageKiePickerModelId,
        numImages: 1,
        resolution: slot.resolution as NanoBananaProResolution,
        aspectRatio: slot.aspectRatio as NanoBananaProAspectRatio,
        imageUrls: slot.imageUrls,
      });
      const taskId = created.taskId ?? created.taskIds?.[0] ?? null;
      if (!taskId) throw new Error("No task id from provider.");
      slot.taskId = taskId;
      slot.status = "pending";
      slot.error = null;
      slot.startedAt = new Date().toISOString();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!isRateLimitError(lastError)) break;
    }
  }
  slot.taskId = null;
  markSlotFailed(slot, lastError);
}

function isRateLimitError(message: string): boolean {
  return /\b429\b|frequency is too high|rate limit|too many requests/i.test(message);
}

/** Final failure: fall back to the previous image when a regeneration did not succeed. */
function markSlotFailed(slot: PersonaSlot, message: string): void {
  slot.error = message;
  if (slot.imageUrl) {
    slot.status = "done";
  } else {
    slot.status = "failed";
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function computeStatus(run: PersonaRun): PersonaRunStatus {
  if (run.validatedAt) return "validated";
  return run.slots.some((s) => s.status === "pending") ? "generating" : "ready";
}

async function refreshSlot(run: PersonaRun, slot: PersonaSlot): Promise<boolean> {
  // A task that never started (provider rejected it) gets the same automatic retries as a failed task.
  if (slot.status === "failed" && !slot.imageUrl && slot.autoRetries < MAX_AUTO_RETRIES) {
    slot.autoRetries += 1;
    serverLog("persona.slot.auto_retry", { externalId: run.externalId, slot: slot.index, reason: slot.error });
    await startSlotTask(slot);
    return true;
  }
  if (slot.status !== "pending" || !slot.taskId) return false;
  let finished: "success" | "fail" | null = null;
  let resultUrl: string | null = null;
  let failMsg = "";
  try {
    const info = await kieMarketRecordInfo(slot.taskId);
    if (kieRecordStateIsSuccess(info.state)) {
      resultUrl = extractKieMediaUrls(info)[0] ?? null;
      finished = resultUrl ? "success" : "fail";
      if (!resultUrl) failMsg = "Provider returned no image.";
    } else if (kieRecordStateIsFail(info.state)) {
      finished = "fail";
      failMsg = info.failMsg || "Generation failed.";
    }
  } catch (err) {
    finished = "fail";
    failMsg = err instanceof Error ? err.message : String(err);
  }

  if (!finished && Date.now() - Date.parse(slot.startedAt) > SLOT_TIMEOUT_MS) {
    finished = "fail";
    failMsg = "Generation timed out.";
  }
  if (!finished) return false;

  if (finished === "success" && resultUrl) {
    try {
      slot.imageUrl = await rehostImage(resultUrl, `persona/${run.externalId}`, `slot-${slot.index}`);
      slot.status = "done";
      slot.error = null;
      return true;
    } catch (err) {
      failMsg = err instanceof Error ? err.message : String(err);
    }
  }

  if (slot.autoRetries < MAX_AUTO_RETRIES) {
    slot.autoRetries += 1;
    serverLog("persona.slot.auto_retry", { externalId: run.externalId, slot: slot.index, reason: failMsg });
    await startSlotTask(slot);
  } else {
    markSlotFailed(slot, failMsg);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export async function createPersonaRun(input: {
  externalId: string;
  gender: PersonaGender;
  selfieUrl: string;
  meta?: Record<string, unknown>;
}): Promise<PersonaRun> {
  const existing = await loadPersonaRun(input.externalId);
  if (existing) throw new PersonaError("A persona run already exists for this user.", 409, "already_exists");

  const selfieUrl = await rehostImage(input.selfieUrl, `persona/${input.externalId}`, "selfie");
  const { spaceId, slots: planned } = await planPersonaSlots(input.gender, selfieUrl);
  const now = new Date().toISOString();
  const run: PersonaRun = {
    version: 1,
    externalId: input.externalId,
    gender: input.gender,
    status: "generating",
    selfieUrl,
    spaceId,
    createdAt: now,
    updatedAt: now,
    validatedAt: null,
    meta: input.meta ?? {},
    slots: planned.map((p) => ({
      ...p,
      taskId: null,
      status: "pending",
      imageUrl: null,
      error: null,
      autoRetries: 0,
      regenerations: 0,
      startedAt: now,
    })),
  };
  // Save first so a crash mid-start still blocks a second (paid) run.
  await savePersonaRun(run);
  await runWithConcurrency(run.slots, TASK_START_CONCURRENCY, startSlotTask);
  run.status = computeStatus(run);
  await savePersonaRun(run);
  serverLog("persona.run.created", {
    externalId: run.externalId,
    gender: run.gender,
    slots: run.slots.length,
    failedToStart: run.slots.filter((s) => s.status === "failed").length,
  });
  return run;
}

export async function refreshPersonaRun(externalId: string): Promise<PersonaRun> {
  const run = await loadPersonaRun(externalId);
  if (!run) throw new PersonaError("No persona run for this user.", 404, "not_found");
  if (run.validatedAt) return run;
  const changed: boolean[] = [];
  await runWithConcurrency(run.slots, REFRESH_CONCURRENCY, async (slot) => {
    changed.push(await refreshSlot(run, slot));
  });
  const nextStatus = computeStatus(run);
  if (changed.some(Boolean) || nextStatus !== run.status) {
    run.status = nextStatus;
    await savePersonaRun(run);
  }
  return run;
}

export async function regeneratePersonaSlot(externalId: string, slotIndex: number): Promise<PersonaRun> {
  const run = await loadPersonaRun(externalId);
  if (!run) throw new PersonaError("No persona run for this user.", 404, "not_found");
  if (run.validatedAt) throw new PersonaError("Persona already validated.", 409, "validated");
  const slot = run.slots.find((s) => s.index === slotIndex);
  if (!slot) throw new PersonaError("Unknown slot.", 404, "unknown_slot");
  if (slot.status === "pending") throw new PersonaError("This image is still generating.", 409, "pending");
  // Failed slots can always be retried for free; only finished images consume the allowance.
  const counts = slot.status === "done";
  if (counts && slot.regenerations >= maxRegensPerSlot()) {
    throw new PersonaError("This image was already regenerated.", 409, "regen_limit");
  }
  slot.autoRetries = 0;
  await startSlotTask(slot);
  // startSlotTask mutates status; widen the narrowed type for the check.
  if ((slot.status as PersonaSlotStatus) !== "pending") {
    await savePersonaRun(run);
    throw new PersonaError(`Could not start regeneration: ${slot.error ?? "provider error"}`, 502, "provider");
  }
  if (counts) slot.regenerations += 1;
  run.status = computeStatus(run);
  await savePersonaRun(run);
  serverLog("persona.slot.regenerate", { externalId, slot: slotIndex, regenerations: slot.regenerations });
  return run;
}

export async function validatePersonaRun(externalId: string): Promise<PersonaRun> {
  const run = await loadPersonaRun(externalId);
  if (!run) throw new PersonaError("No persona run for this user.", 404, "not_found");
  if (run.validatedAt) return run;
  if (run.slots.some((s) => s.status === "pending")) {
    throw new PersonaError("Images are still generating.", 409, "pending");
  }
  if (!run.slots.some((s) => s.status === "done")) {
    throw new PersonaError("No finished image to validate.", 409, "empty");
  }
  run.validatedAt = new Date().toISOString();
  run.status = "validated";
  await savePersonaRun(run);
  return run;
}

/** Public shape returned to API clients (no prompts or internal ids). */
export function serializePersonaRun(run: PersonaRun) {
  const limit = maxRegensPerSlot();
  return {
    externalId: run.externalId,
    gender: run.gender,
    status: run.status,
    selfieUrl: run.selfieUrl,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    validatedAt: run.validatedAt,
    meta: run.meta,
    total: run.slots.length,
    done: run.slots.filter((s) => s.status === "done").length,
    failed: run.slots.filter((s) => s.status === "failed").length,
    slots: run.slots.map((s) => ({
      index: s.index,
      status: s.status,
      imageUrl: s.status === "done" ? s.imageUrl : null,
      poseImageUrl: s.poseImageUrl,
      error: s.status === "failed" ? s.error : null,
      regenerations: s.regenerations,
      canRegenerate: !run.validatedAt && (s.status === "failed" || (s.status === "done" && s.regenerations < limit)),
    })),
  };
}

export function personaErrorResponseBody(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof PersonaError) return { status: err.status, body: { error: err.message, code: err.code } };
  const message = err instanceof Error ? err.message : "Unexpected error.";
  serverLog("persona.error", { message });
  return { status: 500, body: { error: message, code: "internal" } };
}
