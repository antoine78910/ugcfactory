import type { Edge, Node } from "@xyflow/react";

import type { AdAssetNodeData } from "@/app/workflow/nodes/AdAssetNode";
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
import type { KieVeoAspectRatio, KieVeoModel } from "@/lib/kie";
import { pollKlingVideo } from "@/lib/studioKlingClientPoll";

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
  const incoming = edges.filter((e) => e.target === targetNodeId && (e.targetHandle === "in" || !e.targetHandle));
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

/** First image URL from upstream adAsset nodes (output, then reference). */
export function collectLinkedImageUrl(nodes: Node[], edges: Edge[], targetNodeId: string): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === targetNodeId && (e.targetHandle === "in" || !e.targetHandle));
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src || src.type !== "adAsset") continue;
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

async function pollNanoBananaTask(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: {
        successFlag?: number;
        errorMessage?: string | null;
        response?: { resultImageUrl?: string; resultUrls?: string[] };
      };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Image status failed");
    const d = json.data;
    if (!d) throw new Error("No task data");
    if (d.successFlag === 1) {
      const u = d.response?.resultImageUrl ?? d.response?.resultUrls?.[0];
      if (!u?.trim()) throw new Error("No image URL from provider");
      return u.trim();
    }
    if (d.successFlag === -1) throw new Error(d.errorMessage || "Image generation failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Image generation timed out");
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

async function pollVeoVideo(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kie/veo/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: { successFlag?: number; errorMessage?: string | null; response?: { resultUrls?: string[] } };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Veo status failed");
    const d = json.data;
    if (!d) throw new Error("No data");
    if (d.successFlag === 1) {
      const u = d.response?.resultUrls?.[0];
      if (!u) throw new Error("No video URL");
      return u;
    }
    if (d.successFlag === 2 || d.successFlag === 3) {
      throw new Error(d.errorMessage || "Veo generation failed");
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Veo generation timed out");
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

function isVeoPicker(id: string): boolean {
  return id === "veo3" || id === "veo3_fast";
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
      imageUrls: params.referenceImageUrls?.length ? params.referenceImageUrls : undefined,
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
  linkedImageUrl?: string;
  referenceImageUrl?: string;
};

export async function runWorkflowVideoJob(params: WorkflowRunVideoParams): Promise<{ videoUrl: string }> {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const pKey = params.personalApiKey;
  const piKey = params.piapiApiKey;
  const startUrl = params.referenceImageUrl?.trim() || params.linkedImageUrl?.trim() || undefined;
  const quality = klingQualityFromVideoResolution(params.resolution);
  const duration = workflowVideoDefaultDuration(modelId);
  const credits = calculateVideoCredits({
    modelId,
    duration,
    audio: modelId === "kling-3.0/video" || modelId === "kling-2.6/video",
    quality,
  });

  if (
    isSeedancePicker(modelId) &&
    !startUrl &&
    modelId !== "bytedance/seedance-2" &&
    modelId !== "bytedance/seedance-2-fast"
  ) {
    throw new Error("This model needs a reference image. Connect an image module or set a reference on the node.");
  }

  if (isVeoPicker(modelId)) {
    const veoModel: KieVeoModel = "veo3";
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
        generationType: startUrl ? "REFERENCE_2_VIDEO" : "TEXT_2_VIDEO",
        imageUrls: startUrl ? [startUrl] : undefined,
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
      marketModel: modelId,
      prompt: params.prompt,
      imageUrl: startUrl,
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

export function workflowVideoChargeCredits(params: { model: string; resolution: string }): number {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const quality = klingQualityFromVideoResolution(params.resolution);
  const duration = workflowVideoDefaultDuration(modelId);
  return calculateVideoCredits({
    modelId,
    duration,
    audio: modelId === "kling-3.0/video" || modelId === "kling-2.6/video",
    quality,
  });
}
