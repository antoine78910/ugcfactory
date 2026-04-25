import type { Edge, Node } from "@xyflow/react";

import type { AdAssetNodeData } from "@/app/workflow/nodes/AdAssetNode";
import type { ImageRefNodeData } from "@/app/workflow/nodes/ImageRefNode";
import type { TextPromptNodeData } from "@/app/workflow/nodes/TextPromptNode";
import type { PromptListNodeData } from "@/app/workflow/workflowPromptListTypes";
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
  isStudioGptImage2PickerModelId,
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
const WORKFLOW_HISTORY_LABEL_PREFIX = "[Workflow] ";

function workflowHistoryLabel(label: string): string {
  const t = label.trim();
  if (!t) return WORKFLOW_HISTORY_LABEL_PREFIX.trim();
  return t.startsWith(WORKFLOW_HISTORY_LABEL_PREFIX)
    ? t
    : `${WORKFLOW_HISTORY_LABEL_PREFIX}${t}`;
}

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
    if (d.kind === "assistant") {
      const out = (d.assistantOutput ?? "").trim();
      if (out) return out;
    }
    return (d.prompt ?? "").trim();
  }
  if (n.type === "promptList") {
    const d = n.data as PromptListNodeData;
    return (d.lines ?? []).map((x) => x.trim()).filter(Boolean).join("\n\n");
  }
  return "";
}

function isProbablyImageUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (!u.startsWith("http") && !u.startsWith("blob:") && !u.startsWith("data:")) return false;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) || u.includes("/image");
}

function isProbablyVideoUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (!u.startsWith("http") && !u.startsWith("blob:") && !u.startsWith("data:")) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(u);
}

function promptListOutputKind(d: PromptListNodeData): "text" | "image" | "video" {
  if (d.contentKind === "media") {
    const lines = (d.lines ?? []).map((x) => x.trim()).filter(Boolean);
    const images = lines.filter((u) => isProbablyImageUrl(u)).length;
    const videos = lines.filter((u) => isProbablyVideoUrl(u)).length;
    if (videos > images) return "video";
    return "image";
  }
  const lines = (d.lines ?? []).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return "text";
  const images = lines.filter((u) => isProbablyImageUrl(u)).length;
  const videos = lines.filter((u) => isProbablyVideoUrl(u)).length;
  const imageMajority = images >= Math.ceil(lines.length * 0.6);
  const videoMajority = videos >= Math.ceil(lines.length * 0.6);
  if (videoMajority && videos >= images) return "video";
  if (imageMajority) return "image";
  return "text";
}

const RE_LIST_NUMBERED_LINE = /^\s*\d{1,2}\s*[.)]\s+/;
const RE_LIST_LABELLED_ANGLE =
  /^\s*(?:Script|Prompt|Angle|Sujet|Scene)\s*\d+\s*[:\-.]\s*/i;
/** e.g. "**Mirror selfie variation 1:**" or "Mirror selfie variation 2:" */
const RE_LIST_VARIATION_HEADER =
  /^\s*(?:\*\*)?[^\n]{0,200}?\bvariation\s*\d+\b[^\n:]{0,80}:\s*(?:\*\*)?\s*$/i;

/**
 * True when a line starts a new logical list row (title line often followed by a multi-line paragraph).
 * Used for Prompt List text parsing and assistant → list export.
 */
export function isWorkflowTextListSectionStartLine(line: string): boolean {
  if (RE_LIST_NUMBERED_LINE.test(line)) return true;
  if (RE_LIST_LABELLED_ANGLE.test(line)) return true;
  if (RE_LIST_VARIATION_HEADER.test(line)) return true;
  return false;
}

function splitTextListBySectionHeaders(t: string): string[] | null {
  const lines = t.split("\n");
  if (!lines.some((l) => isWorkflowTextListSectionStartLine(l))) return null;

  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (isWorkflowTextListSectionStartLine(line) && cur.length > 0) {
      const joined = cur.join("\n").trim();
      if (joined) blocks.push(joined);
      cur = [];
    }
    cur.push(line);
  }
  const last = cur.join("\n").trim();
  if (last) blocks.push(last);

  const out = dedupeBlocksPreserveOrder(blocks);
  return out.length ? out : null;
}

/** Split pasted / assistant text into discrete prompts (max 50). */
export function splitIntoPromptLines(raw: string): string[] {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const blocks = t
    .split(/\n{3,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const chunks =
    blocks.length > 1
      ? blocks
      : (() => {
          const sectioned = splitTextListBySectionHeaders(t);
          if (sectioned?.length) return sectioned;
          return t.split("\n").map((l) => l.trim()).filter(Boolean);
        })();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.slice(0, 50);
}

function dedupeBlocksPreserveOrder(blocks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const s = b.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Split multi-script assistant output into one list row per prompt (numbered / labeled blocks, ---, else blank lines). */
export function splitAssistantOutputToListLines(raw: string): string[] {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  const lines = t.split("\n");
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (isWorkflowTextListSectionStartLine(line) && cur.length > 0) {
      const joined = cur.join("\n").trim();
      if (joined) blocks.push(joined);
      cur = [];
    }
    cur.push(line);
  }
  const last = cur.join("\n").trim();
  if (last) blocks.push(last);

  let numbered = dedupeBlocksPreserveOrder(blocks);
  if (numbered.length >= 2) {
    const firstLine = numbered[0].split("\n")[0] ?? "";
    if (!isWorkflowTextListSectionStartLine(firstLine) && numbered[1]) {
      const intro = numbered.shift()!;
      numbered[0] = `${intro}\n\n${numbered[0]}`.trim();
    }
    return numbered.slice(0, 50);
  }

  const dashed = dedupeBlocksPreserveOrder(
    t
      .split(/\n-{3,}\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (dashed.length >= 2) return dashed.slice(0, 50);

  // Assistant -> List UX rule:
  // one blank line starts a new item, while single line breaks stay in the same item
  // (so "Variation X" + its paragraph remain a single row).
  const paragraphBlocks = dedupeBlocksPreserveOrder(
    t
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (paragraphBlocks.length >= 2) return paragraphBlocks.slice(0, 50);

  return splitIntoPromptLines(t);
}

/**
 * When a **Prompt list** is wired to the generator’s `text` port, each list line becomes its own job
 * (parallel batch). Otherwise behaves like the classic `composeWorkflowPrompt` merge.
 */
export function collectWorkflowBatchPrompts(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: string[],
  localPrompt: string,
): { batch: string[] | null; composedSingle: string; fromPromptList: boolean } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const wanted = new Set(targetHandles);
  const incoming = edges.filter((e) => {
    if (e.target !== targetNodeId) return false;
    const h = e.targetHandle ?? "";
    return wanted.has(h);
  });

  const appendLocal = (chunk: string) => {
    const loc = localPrompt.trim();
    const ch = chunk.trim();
    if (!loc) return ch;
    if (!ch) return loc;
    return `${ch}\n\n${loc}`;
  };

  let hasList = false;
  const flat: string[] = [];
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (src.type === "promptList") {
      const srcHandle = e.sourceHandle ?? "out";
      const srcKind = promptListOutputKind(src.data as PromptListNodeData);
      const canEmitText = srcHandle === "outText" || (srcHandle === "out" && srcKind === "text");
      if (!canEmitText) continue;
      hasList = true;
      const d = src.data as PromptListNodeData;
      for (const line of (d.lines ?? []).map((x) => x.trim()).filter(Boolean)) {
        flat.push(appendLocal(line));
      }
      continue;
    }
    const t = textFromUpstreamNode(src).trim();
    if (t) flat.push(appendLocal(t));
  }

  if (hasList && flat.length) {
    return { batch: flat, composedSingle: "", fromPromptList: true };
  }

  const linkedParts: string[] = [];
  for (const e of incoming) {
    const src = byId.get(e.source);
    if (!src) continue;
    if (src.type === "promptList") {
      const srcHandle = e.sourceHandle ?? "out";
      const srcKind = promptListOutputKind(src.data as PromptListNodeData);
      const canEmitText = srcHandle === "outText" || (srcHandle === "out" && srcKind === "text");
      if (!canEmitText) continue;
    }
    const t = textFromUpstreamNode(src).trim();
    if (t) linkedParts.push(t);
  }
  const composedSingle = composeWorkflowPrompt(localPrompt, linkedParts);
  return { batch: null, composedSingle, fromPromptList: false };
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
    if (src.type === "promptList") {
      const srcHandle = e.sourceHandle ?? "out";
      const srcKind = promptListOutputKind(src.data as PromptListNodeData);
      const canEmitText = srcHandle === "outText" || (srcHandle === "out" && srcKind === "text");
      if (!canEmitText) continue;
    }
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
    if (src.type === "promptList") {
      const srcHandle = e.sourceHandle ?? "out";
      const srcKind = promptListOutputKind(src.data as PromptListNodeData);
      const canEmitText = srcHandle === "outText" || (srcHandle === "out" && srcKind === "text");
      if (!canEmitText) continue;
    }
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
    if (src.type === "promptList") {
      const d = src.data as PromptListNodeData;
      const srcHandle = e.sourceHandle ?? "out";
      const kind = promptListOutputKind(d);
      if (!(srcHandle === "outImage" || srcHandle === "out" || kind === "image")) continue;
      for (const line of (d.lines ?? []).map((x) => x.trim()).filter(Boolean)) {
        if (!isProbablyImageUrl(line)) continue;
        return line;
      }
      continue;
    }
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
    if (src.type === "promptList") {
      const d = src.data as PromptListNodeData;
      const srcHandle = e.sourceHandle ?? "out";
      const kind = promptListOutputKind(d);
      if (!(srcHandle === "outImage" || srcHandle === "out" || kind === "image")) continue;
      for (const line of (d.lines ?? []).map((x) => x.trim()).filter(Boolean)) {
        if (!isProbablyImageUrl(line) || seen.has(line)) continue;
        seen.add(line);
        urls.push(line);
      }
      continue;
    }
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
    if (src.type === "promptList") {
      const d = src.data as PromptListNodeData;
      const srcHandle = e.sourceHandle ?? "out";
      const kind = promptListOutputKind(d);
      if (!(srcHandle === "outImage" || (srcHandle === "out" && kind === "image"))) continue;
      for (const line of (d.lines ?? []).map((x) => x.trim()).filter(Boolean)) {
        if (!isProbablyImageUrl(line) || seen.has(line)) continue;
        seen.add(line);
        urls.push(line);
      }
      continue;
    }
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

/** Linked video URLs filtered by target handles on the destination node. */
export function collectLinkedVideoUrlsForHandles(
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
    if (src.type === "promptList") {
      const d = src.data as PromptListNodeData;
      const srcHandle = e.sourceHandle ?? "out";
      const kind = promptListOutputKind(d);
      if (!(srcHandle === "outVideo" || (srcHandle === "out" && kind === "video"))) continue;
      for (const line of (d.lines ?? []).map((x) => x.trim()).filter(Boolean)) {
        if (!isProbablyVideoUrl(line) || seen.has(line)) continue;
        seen.add(line);
        urls.push(line);
      }
      continue;
    }
    if (src.type === "imageRef") {
      const d = src.data as ImageRefNodeData;
      if (d.mediaKind !== "video") continue;
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
    if (kind !== "video") continue;
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
  if (r === "1K") return "1K";
  if (r === "2K" || r === "1536") return "2K";
  if (r === "4K") return "4K";
  return "1K";
}

const WORKFLOW_STATUS_FETCH_TIMEOUT_MS = 90_000;
const WORKFLOW_COMPLETE_TIMEOUT_MS = 8_000;

async function pollNanoBananaTask(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 120; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WORKFLOW_STATUS_FETCH_TIMEOUT_MS);
    let res: Response | null = null;
    try {
      res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
        cache: "no-store",
        signal: ac.signal,
      });
    } catch {
      // Network hiccup or local timeout on one poll attempt shouldn't fail the whole generation.
      await new Promise((r) => setTimeout(r, 1600));
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (!res) {
      await new Promise((r) => setTimeout(r, 1600));
      continue;
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
    body: JSON.stringify({ kind: "workflow_video", ...params }),
  });
}

async function completeStudioGenerationTask(taskId: string, resultUrl: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), WORKFLOW_COMPLETE_TIMEOUT_MS);
  try {
    const res = await fetch("/api/studio/generations/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, resultUrl }),
      signal: ac.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { resultUrl?: string };
    if (res.ok && typeof json.resultUrl === "string" && json.resultUrl.trim()) {
      return json.resultUrl.trim();
    }
  } catch {
    /* non-fatal */
  } finally {
    clearTimeout(timer);
  }
  return resultUrl;
}

function workflowVideoDefaultDuration(modelId: string): number {
  switch (modelId) {
    case "kling-3.0/video":
      return 5;
    case "kling-2.5-turbo/video":
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

/** Coerce a workflow aspect string to one Kling/Seedance accepts (16:9, 9:16, 1:1). */
function clampVideoAspect3Way(aspect: string): "16:9" | "9:16" | "1:1" {
  const a = aspect.trim();
  if (a === "16:9") return "16:9";
  if (a === "1:1") return "1:1";
  return "9:16";
}

/** Sora 2 only accepts portrait (9:16) or landscape (16:9). */
function clampSoraAspect(aspect: string): "16:9" | "9:16" {
  return aspect.trim() === "16:9" ? "16:9" : "9:16";
}

/**
 * Picker → which video models accept `aspect_ratio` from the user (when an image is provided too).
 *
 * Kling 3.0 + Seedance accept aspect_ratio in **both** text-to-video and image-to-video.
 * Kling 2.5 Turbo / Kling 2.6 accept aspect_ratio in text-to-video only — when a reference
 * image is attached the KIE API derives the aspect from the image and rejects an explicit value.
 * Sora 2 accepts portrait/landscape in either mode.
 */
function resolveWorkflowKlingAspectForApi(
  modelId: string,
  rawAspect: string,
  hasStartUrl: boolean,
): "16:9" | "9:16" | "1:1" | undefined {
  const isKling30 = modelId === "kling-3.0/video";
  const isKling25Turbo = modelId === "kling-2.5-turbo/video";
  const isKling26 = modelId === "kling-2.6/video";
  const isSora = modelId === "openai/sora-2" || modelId === "openai/sora-2-pro";
  const isSeedance = modelId.startsWith("bytedance/seedance");

  if (isSora) return clampSoraAspect(rawAspect);
  if (isKling30 || isSeedance) return clampVideoAspect3Way(rawAspect);
  if ((isKling25Turbo || isKling26) && !hasStartUrl) return clampVideoAspect3Way(rawAspect);
  return undefined;
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
  onTaskStarted?: (taskId: string) => void;
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

export async function runWorkflowImageJob(params: WorkflowRunImageParams): Promise<{ imageUrl: string; taskId: string }> {
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
  const n = Math.min(10, Math.max(1, params.quantity));
  const resolutionForApi = isStudioGptImage2PickerModelId(pickerModel)
    ? undefined
    : studioImageModelSupportsResolutionPicker(pickerModel)
      ? studioRes
      : "2K";

  const cappedRefs = (params.referenceImageUrls ?? []).slice(0, WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX);
  const resolvedReferenceUrls = await resolveLocalWorkflowMediaUrlsForServer(
    cappedRefs.length ? cappedRefs : undefined,
  );

  const startRes = await fetch("/api/studio/generations/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "workflow_image",
      label: workflowHistoryLabel(params.prompt.slice(0, 120)),
      accountPlan: params.planId,
      prompt: params.prompt,
      model: resolvedModel,
      aspectRatio: params.aspectRatio,
      ...(resolutionForApi ? { resolution: resolutionForApi } : {}),
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
  params.onTaskStarted?.(taskId);

  const providerUrl = await pollNanoBananaTask(taskId, params.personalApiKey);
  const imageUrl = await completeStudioGenerationTask(taskId, providerUrl);
  return { imageUrl, taskId };
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
  /** Seedance 2 Preview / Fast Preview only, maps to PiAPI VIP task and doubles credits. */
  seedancePriority?: "normal" | "vip";
  linkedImageUrl?: string;
  referenceImageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
  onTaskStarted?: (taskId: string) => void;
};

export async function runWorkflowVideoJob(params: WorkflowRunVideoParams): Promise<{ videoUrl: string; taskId: string }> {
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
    audio:
      modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video",
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
    params.onTaskStarted?.(json.taskId);
    await registerStudioVideoTask({
      label: workflowHistoryLabel(params.prompt.slice(0, 120)),
      taskId: json.taskId,
      provider: json.provider,
      model: modelId,
      creditsCharged: credits,
      personalApiKey: pKey,
      inputUrls: startUrl ? [startUrl] : undefined,
    });
    const url = await pollVeoVideo(json.taskId, pKey);
    const finalUrl = await completeStudioGenerationTask(json.taskId, url);
    return { videoUrl: finalUrl, taskId: json.taskId };
  }

  if (!pKey && !piKey && !canUseStudioVideoModel(params.planId, modelId)) {
    throw new Error(studioVideoUpgradeMessage(params.planId, modelId) ?? "Subscription upgrade required for this model.");
  }

  const isKling30 = modelId === "kling-3.0/video";
  const isKling25Turbo = modelId === "kling-2.5-turbo/video";
  const isKling26 = modelId === "kling-2.6/video";
  const isSoraPicker = modelId === "openai/sora-2" || modelId === "openai/sora-2-pro";

  const aspectForApi = resolveWorkflowKlingAspectForApi(
    modelId,
    params.aspectRatio,
    Boolean(startUrl ?? refUrls[0]),
  );

  const genRes = await fetch("/api/kling/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountPlan: params.planId,
      marketModel: marketModelForGenerate,
      prompt: params.prompt,
      imageUrl: startUrl ?? refUrls[0],
      duration,
      aspectRatio: aspectForApi,
      sound:
        modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video"
          ? true
          : undefined,
      mode: isKling30 || isKling25Turbo || isKling26 || isSoraPicker ? quality : undefined,
      multiShots: isKling30 ? false : undefined,
      personalApiKey: pKey,
      piapiApiKey: piKey,
    }),
  });
  const genJson = (await genRes.json()) as { taskId?: string; provider?: string; error?: string };
  if (!genRes.ok || !genJson.taskId) throw new Error(genJson.error || "Video task failed");
  params.onTaskStarted?.(genJson.taskId);

  await registerStudioVideoTask({
    label: workflowHistoryLabel(params.prompt.slice(0, 120)),
    taskId: genJson.taskId,
    provider: genJson.provider,
    model: modelId,
    creditsCharged: credits,
    personalApiKey: pKey,
    piapiApiKey: piKey,
      inputUrls: (startUrl ? [startUrl] : refUrls[0] ? [refUrls[0]] : undefined),
  });

  const url = await pollKlingVideo(genJson.taskId, pKey, piKey);
  const finalUrl = await completeStudioGenerationTask(genJson.taskId, url);
  return { videoUrl: finalUrl, taskId: genJson.taskId };
}

export function workflowImageChargeCredits(params: {
  model: string;
  resolution: string;
  quantity: number;
}): number {
  const pickerModel = resolveWorkflowImagePickerModel(params.model);
  const studioRes = mapWorkflowImageResolutionToStudio(params.resolution);
  const n = Math.min(10, Math.max(1, params.quantity));
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
    audio:
      modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video",
    quality,
  });
  const pri = params.seedancePriority === "vip" ? "vip" : "normal";
  if (pri === "vip" && isWorkflowSeedancePreviewModel(modelId)) return base * 2;
  return base;
}

/** Estimate credits for one runnable adAsset node from current graph wiring. */
export function estimateWorkflowAdAssetRunCredits(
  data: AdAssetNodeData,
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): number {
  if (data.kind !== "image" && data.kind !== "video") return 0;

  const prompt = (data.prompt ?? "").trim();
  const { batch } = collectWorkflowBatchPrompts(nodes, edges, nodeId, ["text", "in"], prompt);
  const batchPromptCount = batch?.length ?? 0;
  const runCount = Math.max(1, batchPromptCount);
  const multiBatchFromList = batchPromptCount > 1;
  const quantity = Math.min(10, Math.max(1, data.quantity ?? 1));

  if (data.kind === "image") {
    const model = (data.model ?? "nano").trim() || "nano";
    const rawRes = (data.resolution ?? "1024").trim();
    const resolution = rawRes === "1024" ? "1K" : rawRes === "1536" ? "2K" : rawRes;
    if (quantity > 1 && !multiBatchFromList) {
      const oneNode = workflowImageChargeCredits({ model, resolution, quantity: 1 });
      return oneNode * quantity * runCount;
    }
    return workflowImageChargeCredits({ model, resolution, quantity }) * runCount;
  }

  const model = (data.model ?? "kling-3.0/video").trim() || "kling-3.0/video";
  const resolution = (data.resolution ?? "720p").trim() || "720p";
  const seedancePriority: "normal" | "vip" = data.videoPriority === "vip" ? "vip" : "normal";
  const oneVideo = workflowVideoChargeCredits({
    model,
    resolution,
    durationSec: data.videoDurationSec,
    seedancePriority,
  });
  if (quantity > 1 && !multiBatchFromList) {
    return oneVideo * quantity * runCount;
  }
  return oneVideo * runCount;
}

/**
 * Start fetching/decoding remote media before React commits new URLs into the workflow canvas,
 * so list thumbnails tend to paint sooner after generation completes.
 */
export function primeRemoteMediaForDisplay(rawUrl: string): void {
  if (typeof window === "undefined") return;
  const trimmed = rawUrl.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("__workflow_pending_media__:")) return;
  const u = trimmed.replace(/#media=(image|video)$/i, "");
  if (!u) return;
  const lower = u.toLowerCase();
  const looksVideo = /\.(mp4|webm|mov)(\?|$)/i.test(lower) || /#media=video/i.test(trimmed);
  if (looksVideo) {
    try {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = u;
      v.load();
    } catch {
      /* ignore */
    }
    return;
  }
  if (!/^https?:|^blob:|^data:/i.test(u)) return;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  } catch {
    /* ignore */
  }
}
