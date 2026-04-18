import type { Edge, Node } from "@xyflow/react";

import type { AdAssetNodeData } from "@/app/workflow/nodes/AdAssetNode";
import type { ImageRefNodeData } from "@/app/workflow/nodes/ImageRefNode";
import type { TextPromptNodeData } from "@/app/workflow/nodes/TextPromptNode";
import type { StickyNoteNodeData } from "@/app/workflow/workflowStickyNoteTypes";
import { calculateVideoCredits } from "@/lib/linkToAd/generationCredits";
import { studioImageCreditsChargedTotal } from "@/lib/pricing";
import {
  type AccountPlanId,
  canUseStudioImagePickerModel,
  canUseStudioVideoModel,
  canUseVeoApiModel,
  studioImagePickerUpgradeMessage,
  studioVideoUpgradeMessage,
  veoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import {
  isStudioImageKiePickerModelId,
  resolveStudioImageModelForReferences,
  studioImageModelSupportsResolutionPicker,
  type StudioImageKiePickerModelId,
} from "@/lib/studioImageModels";
import { normalizeKieVeoModel, type KieVeoAspectRatio } from "@/lib/kie";
import { pollKlingVideo, pollVeoVideo } from "@/lib/studioKlingClientPoll";
import { studioVideoDurationSecOptions, validateStudioVideoJobDuration } from "@/lib/studioVideoModelCapabilities";
import { uploadBlobUrlToCdn } from "@/lib/uploadBlobUrlToCdn";

/** Max reference image wires / URLs merged into one workflow Image generator job (Kie / NanoBanana). */
export const WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX = 14;

export function stripStickyHtmlToText(html: string): string {
  const h = html.trim();
  if (!h) return "";
  if (typeof document !== "undefined") {
    const d = document.createElement("div");
    d.innerHTML = h;
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  return h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function textFromUpstreamNode(n: Node): string {
  if (n.type === "textPrompt") {
    const d = n.data as TextPromptNodeData;
    return (d.prompt ?? "").trim();
  }
  if (n.type === "stickyNote") {
    const d = n.data as StickyNoteNodeData;
    const plain = d.text?.trim();
    if (plain) return plain;
    return stripStickyHtmlToText(d.html ?? "");
  }
  if (n.type === "adAsset") {
    const d = n.data as AdAssetNodeData;
    return (d.prompt ?? "").trim();
  }
  return "";
}

/** Collect non-empty text from nodes connected to this node's target handle `in`. */
export function collectLinkedPromptTexts(nodes: Node[], edges: Edge[], targetNodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter(
    (e) => e.target === targetNodeId && (e.targetHandle === "in" || e.targetHandle === "text" || !e.targetHandle),
  );
  const parts: string[] = [];
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    const t = textFromUpstreamNode(src).trim();
    if (t) parts.push(t);
  }
  return parts;
}

/** Collect prompt text only from edges whose target handle is in `targetHandles` (exact match). */
export function collectLinkedPromptTextsForHandles(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: string[],
): string[] {
  const wanted = new Set(targetHandles);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => {
    if (e.target !== targetNodeId) return false;
    const h = e.targetHandle ?? "";
    return wanted.has(h);
  });
  const parts: string[] = [];
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    const t = textFromUpstreamNode(src).trim();
    if (t) parts.push(t);
  }
  return parts;
}

export function composeWorkflowPrompt(localPrompt: string, linkedParts: string[]): string {
  const local = localPrompt.trim();
  const linked = linkedParts.map((p) => p.trim()).filter(Boolean);
  if (linked.length && local) return `${linked.join("\n\n")}\n\n${local}`;
  if (linked.length) return linked.join("\n\n");
  return local;
}

/** First image URL from upstream adAsset or imageRef nodes. */
export function collectLinkedImageUrl(nodes: Node[], edges: Edge[], targetNodeId: string): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === targetNodeId && (e.targetHandle === "in" || !e.targetHandle));
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (src.type === "imageRef") {
      const d = src.data as ImageRefNodeData;
      if (d.mediaKind === "video") continue;
      const url = d.imageUrl?.trim();
      if (url) return url;
      continue;
    }
    if (src.type !== "adAsset") continue;
    const d = src.data as AdAssetNodeData;
    const out = d.outputPreviewUrl?.trim();
    const ref = d.referencePreviewUrl?.trim();
    const url = out || ref;
    if (!url) continue;
    const kind = d.outputMediaKind ?? d.referenceMediaKind;
    if (kind === "video") continue;
    if (d.kind === "video" && d.referenceMediaKind !== "image" && !out) continue;
    return url;
  }
  return undefined;
}

/** All linked image URLs from upstream adAsset/imageRef nodes (deduplicated, non-video only). */
export function collectLinkedImageUrls(nodes: Node[], edges: Edge[], targetNodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === targetNodeId && (e.targetHandle === "in" || !e.targetHandle));
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (src.type === "imageRef") {
      const d = src.data as ImageRefNodeData;
      if (d.mediaKind === "video") continue;
      const url = d.imageUrl?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      continue;
    }
    if (src.type !== "adAsset") continue;
    const d = src.data as AdAssetNodeData;
    const out = d.outputPreviewUrl?.trim();
    const ref = d.referencePreviewUrl?.trim();
    const url = out || ref;
    if (!url || seen.has(url)) continue;
    const kind = d.outputMediaKind ?? d.referenceMediaKind;
    if (kind === "video") continue;
    if (d.kind === "video" && d.referenceMediaKind !== "image" && !out) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/** Linked image URLs filtered by target handles on the destination node. */
export function collectLinkedImageUrlsForHandles(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: string[],
): string[] {
  const wanted = new Set(targetHandles);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => {
    if (e.target !== targetNodeId) return false;
    const h = e.targetHandle ?? "in";
    return wanted.has(h);
  });
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (src.type === "imageRef") {
      const d = src.data as ImageRefNodeData;
      if (d.mediaKind === "video") continue;
      const url = d.imageUrl?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      continue;
    }
    if (src.type !== "adAsset") continue;
    const d = src.data as AdAssetNodeData;
    const kind = d.outputMediaKind ?? d.referenceMediaKind;
    const targetHandle = e.targetHandle ?? "in";

    if (d.kind === "video" && kind === "video" && (targetHandle === "startImage" || targetHandle === "endImage")) {
      const last = d.videoExtractedLastFrameUrl?.trim();
      const first = d.videoExtractedFirstFrameUrl?.trim();
      const srcHandle = e.sourceHandle ?? "out";
      const pick =
        srcHandle === "videoFirst"
          ? first
          : srcHandle === "videoLast"
            ? last
            : last || first;
      if (!pick || seen.has(pick)) continue;
      seen.add(pick);
      urls.push(pick);
      continue;
    }

    const srcHandle = e.sourceHandle ?? "out";
    if (srcHandle === "generated") {
      const out = d.outputPreviewUrl?.trim();
      if (!out || seen.has(out)) continue;
      if (kind === "video") continue;
      if (d.outputMediaKind === "video") continue;
      seen.add(out);
      urls.push(out);
      continue;
    }

    const out = d.outputPreviewUrl?.trim();
    const ref = d.referencePreviewUrl?.trim();
    const url = out || ref;
    if (!url || seen.has(url)) continue;
    if (kind === "video") continue;
    if (d.kind === "video" && d.referenceMediaKind !== "image" && !out) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function resolveWorkflowImagePickerModel(raw: string): StudioImageKiePickerModelId {
  const t = raw.trim();
  if (t === "auto" || !t) return "nano";
  if (isStudioImageKiePickerModelId(t)) return t;
  return "nano";
}

export function mapWorkflowImageResolutionToStudio(res: string): "1K" | "2K" | "4K" {
  const r = res.trim();
  if (r === "2K" || r === "1536") return "2K";
  if (r === "4K") return "4K";
  return "1K";
}

const WORKFLOW_STATUS_FETCH_TIMEOUT_MS = 45_000;

async function pollNanoBananaTask(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 120; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WORKFLOW_STATUS_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
        cache: "no-store",
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: {
      data?: {
        successFlag?: number;
        errorMessage?: string | null;
        response?: { resultImageUrl?: string; resultUrls?: string[] };
      };
      error?: string;
    };
    try {
      json = text.trim() ? (JSON.parse(text) as typeof json) : {};
    } catch {
      const snippet = text.slice(0, 200).replace(/\s+/g, " ");
      throw new Error(
        res.ok ? `Invalid image task JSON: ${snippet}` : `Image status error (HTTP ${res.status}): ${snippet}`,
      );
    }
    if (!res.ok) throw new Error(json.error?.trim() || `Image status failed (HTTP ${res.status}).`);
    const d = json.data;
    if (!d) throw new Error("No task data");
    if (d.successFlag === 1) {
      const u = d.response?.resultImageUrl ?? d.response?.resultUrls?.[0];
      if (!u?.trim()) throw new Error("No image URL from provider");
      return u.trim();
    }
    if (d.successFlag === -1) throw new Error(d.errorMessage?.trim() || "Image generation failed.");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Image generation timed out. Please try again.");
}

async function registerStudioVideoTask(params: {
  label: string;
  taskId: string;
  provider?: string;
  model?: string;
  creditsCharged: number;
  personalApiKey?: string;
  piapiApiKey?: string;
  inputUrls?: string[];
}): Promise<void> {
  await fetch("/api/studio/generations/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "studio_video", ...params }),
  });
}

async function completeStudioGenerationTask(taskId: string, resultUrl: string): Promise<void> {
  try {
    await fetch("/api/studio/generations/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, resultUrl }),
    });
  } catch {
    /* non-fatal */
  }
}

function workflowVideoDefaultDuration(modelId: string): number {
  switch (modelId) {
    case "kling-3.0/video":
      return 5;
    case "kling-2.6/video":
      return 5;
    case "openai/sora-2":
    case "openai/sora-2-pro":
      return 10;
    case "bytedance/seedance-2-preview":
    case "bytedance/seedance-2-fast-preview":
    case "bytedance/seedance-2":
    case "bytedance/seedance-2-fast":
      return 10;
    case "veo3_lite":
    case "veo3_fast":
    case "veo3":
      return 8;
    default:
      return 5;
  }
}

function klingQualityFromVideoResolution(res: string): "std" | "pro" {
  return res.trim() === "1080p" ? "pro" : "std";
}

function veoAspectFromWorkflowAspect(aspect: string): KieVeoAspectRatio {
  if (aspect === "9:16") return "9:16";
  if (aspect === "16:9") return "16:9";
  return "Auto";
}

export function resolveWorkflowVideoModelId(raw: string): string {
  const t = raw.trim();
  if (t === "auto" || !t) return "kling-3.0/video";
  return t;
}

function seedancePreviewMarketModelForGenerate(modelId: string, priority: "normal" | "vip"): string {
  if (priority !== "vip") return modelId;
  if (modelId === "bytedance/seedance-2-preview") return "bytedance/seedance-2-preview-vip";
  if (modelId === "bytedance/seedance-2-fast-preview") return "bytedance/seedance-2-fast-preview-vip";
  return modelId;
}

function isWorkflowSeedancePreviewModel(modelId: string): boolean {
  return modelId === "bytedance/seedance-2-preview" || modelId === "bytedance/seedance-2-fast-preview";
}

/** Clamp stored duration to allowed values for the resolved workflow video model. */
export function coerceWorkflowVideoDurationSec(rawModel: string, stored: number | undefined): number {
  const modelId = resolveWorkflowVideoModelId(rawModel);
  const allowed = studioVideoDurationSecOptions(modelId)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!allowed.length) {
    return workflowVideoDefaultDuration(modelId);
  }
  const s = stored != null && Number.isFinite(stored) ? Math.round(Number(stored)) : NaN;
  if (allowed.includes(s)) return s;
  return workflowVideoDefaultDuration(modelId);
}

function isVeoPicker(id: string): boolean {
  return id === "veo3_lite" || id === "veo3_fast" || id === "veo3";
}

function isSeedancePicker(id: string): boolean {
  return id.startsWith("bytedance/seedance");
}

export type WorkflowRunImageParams = {
  planId: AccountPlanId;
  personalApiKey?: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quantity: number;
  referenceImageUrls?: string[];
};

function isLocalOnlyWorkflowMediaUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("blob:") || u.startsWith("data:");
}

function mimeFromDataUrl(url: string): string | undefined {
  const m = /^data:([^;,]+)/i.exec(url.trim());
  return m?.[1];
}

/**
 * Browser-only: uploads blob/data URLs to public storage so server-side generation can fetch them.
 */
async function resolveLocalWorkflowMediaUrlForServer(url: string): Promise<string> {
  const u = url.trim();
  if (!u || !isLocalOnlyWorkflowMediaUrl(u)) return u;
  const dataMime = u.startsWith("data:") ? mimeFromDataUrl(u) : undefined;
  const fallbackMime =
    dataMime && /^image\//i.test(dataMime)
      ? dataMime
      : dataMime && /^video\//i.test(dataMime)
        ? dataMime
        : "image/png";
  const ext = /^video\//i.test(fallbackMime)
    ? fallbackMime.includes("webm")
      ? ".webm"
      : fallbackMime.includes("quicktime")
        ? ".mov"
        : ".mp4"
    : fallbackMime.includes("jpeg") || fallbackMime.includes("jpg")
      ? ".jpg"
      : fallbackMime.includes("webp")
        ? ".webp"
        : fallbackMime.includes("gif")
          ? ".gif"
          : ".png";
  return uploadBlobUrlToCdn(u, `workflow-media-${crypto.randomUUID()}${ext}`, fallbackMime);
}

async function resolveLocalWorkflowMediaUrlsForServer(urls: string[] | undefined): Promise<string[]> {
  if (!urls?.length) return [];
  const out: string[] = [];
  for (const raw of urls) {
    const t = raw.trim();
    if (!t) continue;
    out.push(await resolveLocalWorkflowMediaUrlForServer(t));
  }
  return out;
}

export async function runWorkflowImageJob(params: WorkflowRunImageParams): Promise<{ imageUrl: string }> {
  const pickerModel = resolveWorkflowImagePickerModel(params.model);
  if (!params.personalApiKey && !canUseStudioImagePickerModel(params.planId, pickerModel)) {
    throw new Error(
      studioImagePickerUpgradeMessage(params.planId, pickerModel) ?? "Subscription upgrade required for this model.",
    );
  }

  const resolvedModel = resolveStudioImageModelForReferences(
    pickerModel,
    Boolean(params.referenceImageUrls?.length),
  );
  const studioRes = mapWorkflowImageResolutionToStudio(params.resolution);
  const n = Math.min(4, Math.max(1, params.quantity));
  const resolutionForApi = studioImageModelSupportsResolutionPicker(pickerModel) ? studioRes : "2K";

  const cappedRefs = (params.referenceImageUrls ?? []).slice(0, WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX);
  const resolvedReferenceUrls = await resolveLocalWorkflowMediaUrlsForServer(
    cappedRefs.length ? cappedRefs : undefined,
  );

  const startRes = await fetch("/api/studio/generations/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "studio_image",
      label: params.prompt.slice(0, 120),
      accountPlan: params.planId,
      prompt: params.prompt,
      model: resolvedModel,
      aspectRatio: params.aspectRatio,
      resolution: resolutionForApi,
      numImages: n,
      personalApiKey: params.personalApiKey,
      imageUrls: resolvedReferenceUrls.length ? resolvedReferenceUrls : undefined,
    }),
  });
  const startJson = (await startRes.json()) as {
    data?: { taskId?: string; rows?: { taskId?: string }[] };
    error?: string;
  };
  if (!startRes.ok) throw new Error(startJson.error || "Could not start image job");
  const taskId =
    (startJson.data?.taskId ?? startJson.data?.rows?.[0]?.taskId)?.trim() ?? "";
  if (!taskId) throw new Error("No task id from server");

  const imageUrl = await pollNanoBananaTask(taskId, params.personalApiKey);
  return { imageUrl };
}

export type WorkflowRunVideoParams = {
  planId: AccountPlanId;
  personalApiKey?: string;
  piapiApiKey?: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  /** Seconds; coerced per model if missing or invalid. */
  durationSec?: number;
  /** Seedance 2 Preview / Fast Preview only — maps to PiAPI VIP task and doubles credits. */
  seedancePriority?: "normal" | "vip";
  linkedImageUrl?: string;
  referenceImageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
};

export async function runWorkflowVideoJob(params: WorkflowRunVideoParams): Promise<{ videoUrl: string }> {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const pKey = params.personalApiKey;
  const piKey = params.piapiApiKey;
  const startRaw = params.referenceImageUrl?.trim() || params.linkedImageUrl?.trim() || "";
  const startUrl = startRaw ? await resolveLocalWorkflowMediaUrlForServer(startRaw) : undefined;
  const endRaw = params.endImageUrl?.trim() || "";
  const endUrl = endRaw ? await resolveLocalWorkflowMediaUrlForServer(endRaw) : undefined;
  const refUrls = await resolveLocalWorkflowMediaUrlsForServer(
    (params.referenceImageUrls ?? []).map((u) => u.trim()).filter(Boolean),
  );
  const quality = klingQualityFromVideoResolution(params.resolution);
  const seedancePri: "normal" | "vip" = params.seedancePriority === "vip" ? "vip" : "normal";
  const duration = coerceWorkflowVideoDurationSec(params.model, params.durationSec);
  const marketModelForGenerate = seedancePreviewMarketModelForGenerate(modelId, seedancePri);
  try {
    validateStudioVideoJobDuration(marketModelForGenerate, duration);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Invalid video duration.");
  }
  const baseCredits = calculateVideoCredits({
    modelId,
    duration,
    audio: modelId === "kling-3.0/video" || modelId === "kling-2.6/video",
    quality,
  });
  const credits =
    seedancePri === "vip" && isWorkflowSeedancePreviewModel(modelId) ? baseCredits * 2 : baseCredits;

  if (
    isSeedancePicker(modelId) &&
    !startUrl &&
    modelId !== "bytedance/seedance-2" &&
    modelId !== "bytedance/seedance-2-fast"
  ) {
    throw new Error("This model needs a reference image. Connect an image module or set a reference on the node.");
  }

  if (isVeoPicker(modelId)) {
    const veoModel = normalizeKieVeoModel(modelId);
    if (!pKey && !canUseVeoApiModel(params.planId, veoModel)) {
      throw new Error(veoUpgradeMessage(params.planId, veoModel) ?? "Subscription upgrade required for Veo.");
    }
    const veoAspect = veoAspectFromWorkflowAspect(params.aspectRatio);
    const res = await fetch("/api/kie/veo/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountPlan: params.planId,
        prompt: params.prompt,
        model: veoModel,
        aspectRatio: veoAspect,
        generationType: startUrl ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO",
        imageUrls: startUrl ? [startUrl, ...(endUrl ? [endUrl] : [])] : undefined,
        personalApiKey: pKey,
      }),
    });
    const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
    if (!res.ok || !json.taskId) throw new Error(json.error || "Veo failed");
    await registerStudioVideoTask({
      label: params.prompt.slice(0, 120),
      taskId: json.taskId,
      provider: json.provider,
      model: modelId,
      creditsCharged: credits,
      personalApiKey: pKey,
      inputUrls: startUrl ? [startUrl] : undefined,
    });
    const url = await pollVeoVideo(json.taskId, pKey);
    void completeStudioGenerationTask(json.taskId, url);
    return { videoUrl: url };
  }

  if (!pKey && !piKey && !canUseStudioVideoModel(params.planId, modelId)) {
    throw new Error(studioVideoUpgradeMessage(params.planId, modelId) ?? "Subscription upgrade required for this model.");
  }

  const isKling30 = modelId === "kling-3.0/video";
  const isKling26 = modelId === "kling-2.6/video";
  const isSoraPicker = modelId === "openai/sora-2" || modelId === "openai/sora-2-pro";
  const isSeedanceI2V = isSeedancePicker(modelId);

  const genRes = await fetch("/api/kling/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountPlan: params.planId,
      marketModel: marketModelForGenerate,
      prompt: params.prompt,
      imageUrl: startUrl ?? refUrls[0],
      duration,
      aspectRatio:
        (isKling30 || isKling26) && !startUrl
          ? params.aspectRatio === "1:1"
            ? "1:1"
            : params.aspectRatio === "16:9"
              ? "16:9"
              : "9:16"
          : isSeedanceI2V && startUrl
            ? params.aspectRatio === "1:1"
              ? "1:1"
              : params.aspectRatio === "16:9"
                ? "16:9"
                : "9:16"
            : isSoraPicker
              ? params.aspectRatio === "16:9"
                ? "16:9"
                : "9:16"
              : undefined,
      sound: modelId === "kling-3.0/video" || modelId === "kling-2.6/video" ? true : undefined,
      mode: isKling30 || isKling26 || isSoraPicker ? quality : undefined,
      multiShots: isKling30 ? false : undefined,
      personalApiKey: pKey,
      piapiApiKey: piKey,
    }),
  });
  const genJson = (await genRes.json()) as { taskId?: string; provider?: string; error?: string };
  if (!genRes.ok || !genJson.taskId) throw new Error(genJson.error || "Video task failed");

  await registerStudioVideoTask({
    label: params.prompt.slice(0, 120),
    taskId: genJson.taskId,
    provider: genJson.provider,
    model: modelId,
    creditsCharged: credits,
    personalApiKey: pKey,
    piapiApiKey: piKey,
    inputUrls: startUrl ? [startUrl] : undefined,
  });

  const url = await pollKlingVideo(genJson.taskId, pKey, piKey);
  void completeStudioGenerationTask(genJson.taskId, url);
  return { videoUrl: url };
}

export function workflowImageChargeCredits(params: {
  model: string;
  resolution: string;
  quantity: number;
}): number {
  const pickerModel = resolveWorkflowImagePickerModel(params.model);
  const studioRes = mapWorkflowImageResolutionToStudio(params.resolution);
  const n = Math.min(4, Math.max(1, params.quantity));
  const resolutionForPricing = studioImageModelSupportsResolutionPicker(pickerModel) ? studioRes : "2K";
  return studioImageCreditsChargedTotal({
    studioModel: pickerModel,
    resolution: resolutionForPricing,
    numImages: n,
  });
}

export function workflowVideoChargeCredits(params: {
  model: string;
  resolution: string;
  durationSec?: number;
  seedancePriority?: "normal" | "vip";
}): number {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const quality = klingQualityFromVideoResolution(params.resolution);
  const duration = coerceWorkflowVideoDurationSec(params.model, params.durationSec);
  const base = calculateVideoCredits({
    modelId,
    duration,
    audio: modelId === "kling-3.0/video" || modelId === "kling-2.6/video",
    quality,
  });
  const pri = params.seedancePriority === "vip" ? "vip" : "normal";
  if (pri === "vip" && isWorkflowSeedancePreviewModel(modelId)) return base * 2;
  return base;
}
