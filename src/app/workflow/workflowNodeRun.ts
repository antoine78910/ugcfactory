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
  canUseMotionControl,
  canUseStudioImagePickerModel,
  canUseStudioVideoModel,
  motionControlUpgradeMessage,
  canUseVeoApiModel,
  studioImagePickerUpgradeMessage,
  studioVideoUpgradeMessage,
  veoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { calculateMotionControlCreditsFromDuration } from "@/lib/pricing";
import {
  isStudioGptImage2PickerModelId,
  isStudioImageKiePickerModelId,
  resolveStudioImageModelForReferences,
  studioImageModelSupportsResolutionPicker,
  type StudioImageKiePickerModelId,
} from "@/lib/studioImageModels";
import { normalizeKieVeoModel, type KieVeoAspectRatio } from "@/lib/kie";
import { pollKlingVideo, pollVeoVideo } from "@/lib/studioKlingClientPoll";
import {
  normalizeLegacySeedanceMarketModelId,
  studioVideoDurationSecOptions,
  validateStudioVideoJobDuration,
} from "@/lib/studioVideoModelCapabilities";
import { SEEDANCE_PRO_MAX_VIDEO_URLS, SEEDANCE_PRO_PROMPT_MAX_CHARS } from "@/lib/piapiSeedance";
import { uploadBlobUrlToCdn } from "@/lib/uploadBlobUrlToCdn";
import { guardedFetch } from "@/lib/guardedFetch";
import { isTaskTerminallyDeadButRetryable } from "@/lib/providerTransientError";
import { appendWorkflowRunCorrelationToLabel } from "@/lib/workflowRunCorrelation";

import { workflowVideoResolutionToPiapiSeedance } from "./workflowVideoExportDimensions";
import {
  WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS,
  WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL,
} from "./workflowProfile360Preset";

/** File input accept for Seedance 2 / Fast omni motion reference uploads (aligned with Studio). */
export const WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov";

/** Max reference image wires / URLs merged into one workflow Image generator job (Kie / NanoBanana). */
export const WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX = 12;
const WORKFLOW_HISTORY_LABEL_PREFIX = "[Workflow] ";

function workflowHistoryLabel(label: string): string {
  const t = label.trim();
  if (!t) return WORKFLOW_HISTORY_LABEL_PREFIX.trim();
  return t.startsWith(WORKFLOW_HISTORY_LABEL_PREFIX)
    ? t
    : `${WORKFLOW_HISTORY_LABEL_PREFIX}${t}`;
}

/** Label stored on `studio_generations` for workflow jobs; optional correlation disambiguates concurrent runs. */
function workflowHistoryStorageLabel(promptSnippet: string, workflowRunCorrelationId?: string | null): string {
  return appendWorkflowRunCorrelationToLabel(workflowHistoryLabel(promptSnippet.slice(0, 120)), workflowRunCorrelationId);
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

  const numbered = dedupeBlocksPreserveOrder(blocks);
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

/** Text ports on generators (Video / Image / Motion). */
export const WORKFLOW_TEXT_INPUT_HANDLES = ["text", "inText"] as const;

/** Generators also accept legacy single `in` port and unset handle IDs. */
export const WORKFLOW_GENERATOR_TEXT_TARGET_HANDLES = [
  "text",
  "inText",
  "in",
  "",
] as const;

/**
 * Assistant text ports: includes legacy `in` and empty handle from older single-port wiring.
 */
export const WORKFLOW_ASSISTANT_TEXT_TARGET_HANDLES = [
  "text",
  "inText",
  "in",
  "",
] as const;

export function workflowTextInputTargetHandles(
  targetNode: Node | undefined,
): readonly string[] {
  if (targetNode?.type !== "adAsset") return WORKFLOW_TEXT_INPUT_HANDLES;
  const kind = (targetNode.data as AdAssetNodeData).kind;
  if (kind === "assistant") return WORKFLOW_ASSISTANT_TEXT_TARGET_HANDLES;
  if (kind === "image" || kind === "video" || kind === "motion") {
    return WORKFLOW_GENERATOR_TEXT_TARGET_HANDLES;
  }
  return WORKFLOW_TEXT_INPUT_HANDLES;
}

const WORKFLOW_ANY_TEXT_TARGET_HANDLES = new Set([
  "text",
  "inText",
  "in",
  "",
]);

/** Text from Assistant modules wired into a generator's text-side ports (uses `assistantOutput`). */
export function collectUpstreamAssistantTexts(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.target !== targetNodeId) continue;
    const h = e.targetHandle ?? "";
    if (!WORKFLOW_ANY_TEXT_TARGET_HANDLES.has(h)) continue;
    const src = byId.get(e.source);
    if (!src || src.type !== "adAsset") continue;
    const d = src.data as AdAssetNodeData;
    if (d.kind !== "assistant") continue;
    const out = (d.assistantOutput ?? "").trim();
    const text = out || (d.prompt ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts;
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
      if (d.mediaKind === "video") {
        const srcHandle = e.sourceHandle ?? "out";
        const first = d.videoExtractedFirstFrameUrl?.trim();
        const last = d.videoExtractedLastFrameUrl?.trim();
        const targetHandle = e.targetHandle ?? "in";
        const picked =
          srcHandle === "videoFirst"
            ? first
            : srcHandle === "videoLast"
              ? last
              : targetHandle === "endImage"
                ? last || first
                : first || last;
        if (!picked || seen.has(picked)) continue;
        seen.add(picked);
        urls.push(picked);
        continue;
      }
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

    /** Video modules: frame outputs / double-click extraction feed start, end, and reference image ports. */
    const videoFrameImageTargets = new Set(["startImage", "startImageAlt", "endImage", "references", "inImage"]);
    if (d.kind === "video" && kind === "video" && videoFrameImageTargets.has(targetHandle)) {
      const last = d.videoExtractedLastFrameUrl?.trim();
      const first = d.videoExtractedFirstFrameUrl?.trim();
      const srcHandle = e.sourceHandle ?? "out";
      const pick =
        srcHandle === "videoFirst"
          ? first
          : srcHandle === "videoLast"
            ? last
            : targetHandle === "endImage"
              ? last || first
              : first || last;
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
/**
 * Image poll interval, with jitter to desync parallel batches (a 6-prompt batch with
 * a fixed 2 s interval used to hammer Kie at ~3 req/s and trigger
 * "Your call frequency is too high. Please try again later." even though every job
 * succeeded server-side. We back off progressively and add randomness so concurrent
 * polls don't lock-step.
 */
const WORKFLOW_IMAGE_POLL_BASE_MS = 3_000;
const WORKFLOW_IMAGE_POLL_MAX_MS = 9_000;
const WORKFLOW_IMAGE_POLL_JITTER = 0.25;
/**
 * Total budget = ~12 minutes (90 polls × ~8 s avg incl. backoff). Way above the longest
 * known nano-banana / pro generation, but still bounded so a truly-stuck job ends.
 */
const WORKFLOW_IMAGE_POLL_MAX_ROUNDS = 90;

function imagePollDelayMs(attempt: number): number {
  const grow = Math.min(WORKFLOW_IMAGE_POLL_MAX_MS, WORKFLOW_IMAGE_POLL_BASE_MS + attempt * 250);
  const jitter = grow * WORKFLOW_IMAGE_POLL_JITTER;
  return Math.max(1500, Math.floor(grow + (Math.random() * 2 - 1) * jitter));
}

function isImagePollTransientMessage(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    /\bcall frequency\b/.test(m) ||
    /frequency is too high/.test(m) ||
    /\btoo many (requests|calls)\b/.test(m) ||
    /\brate ?limit/.test(m) ||
    /\bthrottl/.test(m) ||
    /\b429\b|\b502\b|\b503\b|\b504\b/.test(m) ||
    /try again later/.test(m) ||
    /temporar/.test(m) ||
    /timeout|timed out|deadline exceeded|gateway time/.test(m) ||
    /fetch failed|failed to fetch|networkerror|load failed|econnreset|socket|und_err_socket|other side closed|aborted?/.test(
      m,
    ) ||
    /service unavailable|bad gateway|server exception|internal error|busy|overload/.test(m)
  );
}

async function pollNanoBananaTask(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  // Desynchronize parallel job starts so a 50/100-prompt batch doesn't all hit the
  // first poll on the exact same millisecond and trigger Kie's frequency throttle.
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1500)));
  let consecutiveTransient = 0;
  for (let i = 0; i < WORKFLOW_IMAGE_POLL_MAX_ROUNDS; i++) {
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
      consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
      await new Promise((r) => setTimeout(r, imagePollDelayMs(i + consecutiveTransient)));
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (!res) {
      await new Promise((r) => setTimeout(r, imagePollDelayMs(i)));
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
      // Treat unparseable bodies as transient when the HTTP status is also transient,
      // otherwise surface to the user.
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, imagePollDelayMs(i + consecutiveTransient)));
        continue;
      }
      throw new Error(
        res.ok ? `Invalid image task JSON: ${snippet}` : `Image status error (HTTP ${res.status}): ${snippet}`,
      );
    }
    if (!res.ok) {
      const errMsg = (json.error ?? "").trim();
      // Transient HTTP from our own route or upstream: keep polling, the task usually completes.
      if (
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        isImagePollTransientMessage(errMsg)
      ) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, imagePollDelayMs(i + consecutiveTransient)));
        continue;
      }
      throw new Error(errMsg || `Image status failed (HTTP ${res.status}).`);
    }
    consecutiveTransient = 0;
    const d = json.data;
    if (!d) {
      // Server returned 200 but no `data`: treat as still pending rather than failing the whole run.
      await new Promise((r) => setTimeout(r, imagePollDelayMs(i)));
      continue;
    }
    if (d.successFlag === 1) {
      const u = d.response?.resultImageUrl ?? d.response?.resultUrls?.[0];
      if (!u?.trim()) throw new Error("No image URL from provider");
      return u.trim();
    }
    if (d.successFlag === -1) {
      const errMsg = d.errorMessage?.trim() ?? "";
      // Kie marks a task `fail` with "Service is currently unavailable due to high
      // demand. (E003)" when their fleet is overloaded. The task is permanently dead
      // — we must NOT keep polling forever (that's how 100-prompt batches OOM the
      // serverless instance). Bubble up so the outer job wrapper can re-submit a
      // fresh task with backoff.
      if (errMsg && isTaskTerminallyDeadButRetryable(errMsg)) {
        throw new Error(errMsg);
      }
      // Some providers report rate-limit messages on a "failed" envelope even when the task
      // is actually still running. If the message is transient-shaped, keep polling.
      if (errMsg && isImagePollTransientMessage(errMsg)) {
        consecutiveTransient = Math.min(consecutiveTransient + 1, 12);
        await new Promise((r) => setTimeout(r, imagePollDelayMs(i + consecutiveTransient)));
        continue;
      }
      throw new Error(errMsg || "Image generation failed.");
    }
    await new Promise((r) => setTimeout(r, imagePollDelayMs(i)));
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
  const id = normalizeLegacySeedanceMarketModelId(modelId);
  switch (id) {
    case "kling-3.0/video":
      return 5;
    case "kling-2.5-turbo/video":
    case "kling-2.6/video":
      return 5;
    case "openai/sora-2":
    case "openai/sora-2-pro":
      return 10;
    case "bytedance/seedance-1.5-pro":
      return 8;
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

/** Maps workflow video picker resolution to PiAPI Seedance billing tiers. */
function workflowSeedanceVideoResolution(res: string): "480p" | "720p" | "1080p" {
  const t = res.trim().toLowerCase();
  if (t === "480p") return "480p";
  if (t === "1080p") return "1080p";
  return "720p";
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

/** Clamp stored duration to allowed values for the resolved workflow video model. */
export function coerceWorkflowVideoDurationSec(rawModel: string, stored: number | undefined): number {
  const modelId = normalizeLegacySeedanceMarketModelId(resolveWorkflowVideoModelId(rawModel));
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
  /** Matches `pendingWorkflowRun.correlationId` for safe poll / race recovery across concurrent runs. */
  workflowRunCorrelationId?: string | null;
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

async function loadImageElementFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onErr);
        reject(new Error("Could not load image."));
      };
      img.addEventListener("load", onLoad, { once: true });
      img.addEventListener("error", onErr, { once: true });
      img.src = objectUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchImageBlobForWorkflow(url: string): Promise<Blob> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Missing image URL.");
  if (isLocalOnlyWorkflowMediaUrl(trimmed)) {
    const r = await fetch(trimmed, { cache: "no-store" });
    if (!r.ok) throw new Error(`Could not read local image (${r.status}).`);
    return await r.blob();
  }
  try {
    const r = await fetch(`/api/download?url=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
    if (r.ok) return await r.blob();
  } catch {
    // Fall back to direct CORS fetch below.
  }
  const direct = await fetch(trimmed, { mode: "cors", cache: "no-store" });
  if (!direct.ok) throw new Error(`Could not fetch image (${direct.status}).`);
  return await direct.blob();
}

/**
 * Provider guardrail:
 * Video models reject start/end frames where width or height < 300.
 * Normalize any incoming image URL (linked or uploaded) so both dimensions
 * are >= 300 before sending generation requests.
 */
async function ensureWorkflowImageMinEdge(url: string, minEdge = 300): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || typeof window === "undefined") return trimmed;
  const blob = await fetchImageBlobForWorkflow(trimmed);
  if (!/^image\//i.test(blob.type)) return trimmed;
  const img = await loadImageElementFromBlob(blob);
  const w = Math.max(1, img.naturalWidth || 0);
  const h = Math.max(1, img.naturalHeight || 0);
  if (w >= minEdge && h >= minEdge) return trimmed;

  const scale = Math.max(minEdge / w, minEdge / h);
  const tw = Math.max(minEdge, Math.round(w * scale));
  const th = Math.max(minEdge, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return trimmed;
  ctx.drawImage(img, 0, 0, tw, th);
  const normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return uploadBlobUrlToCdn(
    normalizedDataUrl,
    `workflow-image-min300-${crypto.randomUUID()}.jpg`,
    "image/jpeg",
    { kind: "image" },
  );
}

/**
 * Max attempts when Kie reports the task is terminally dead with a transient cause
 * (e.g. "Service is currently unavailable due to high demand. (E003)"). We resubmit
 * a fresh task on each retry, with a progressive wait so we don't pile onto the
 * same overloaded backend.
 */
const WORKFLOW_IMAGE_TASK_RETRY_MAX_ATTEMPTS = 5;
const WORKFLOW_IMAGE_TASK_RETRY_BASE_DELAY_MS = 5_000;

function workflowImageTaskRetryDelayMs(attempt: number): number {
  // ~5s, 10s, 15s, 20s with ±20% jitter to spread retries across parallel jobs.
  const base = WORKFLOW_IMAGE_TASK_RETRY_BASE_DELAY_MS * (attempt + 1);
  const jitter = base * 0.2;
  return Math.max(2_000, Math.floor(base + (Math.random() * 2 - 1) * jitter));
}

function isRetryableImageTaskMessage(message: string): boolean {
  if (!message) return false;
  if (isTaskTerminallyDeadButRetryable(message)) return true;
  if (isImagePollTransientMessage(message)) return true;
  return false;
}

async function runWorkflowImageJobOnce(params: WorkflowRunImageParams): Promise<{ imageUrl: string; taskId: string }> {
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

  const { blocked, response: startRes } = await guardedFetch("/api/studio/generations/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "workflow_image",
      label: workflowHistoryStorageLabel(params.prompt, params.workflowRunCorrelationId),
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
  if (blocked) throw new Error("INSUFFICIENT_CREDITS");
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

export async function runWorkflowImageJob(params: WorkflowRunImageParams): Promise<{ imageUrl: string; taskId: string }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < WORKFLOW_IMAGE_TASK_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await runWorkflowImageJobOnce(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      // Never retry insufficient-credits or plan-gate errors — these are user-facing and final.
      if (
        message === "INSUFFICIENT_CREDITS" ||
        /subscription upgrade required/i.test(message)
      ) {
        throw err instanceof Error ? err : new Error(message);
      }
      lastError = err instanceof Error ? err : new Error(message);
      if (!isRetryableImageTaskMessage(message)) {
        throw lastError;
      }
      if (attempt >= WORKFLOW_IMAGE_TASK_RETRY_MAX_ATTEMPTS - 1) break;
      const waitMs = workflowImageTaskRetryDelayMs(attempt);
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[workflow.image] retrying image job after transient error", {
          attempt: attempt + 1,
          maxAttempts: WORKFLOW_IMAGE_TASK_RETRY_MAX_ATTEMPTS,
          waitMs,
          message,
        });
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw (
    lastError ??
    new Error(
      `Image generation failed after ${WORKFLOW_IMAGE_TASK_RETRY_MAX_ATTEMPTS} attempts. The provider is overloaded — please try again in a moment.`,
    )
  );
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
  /** Optional native audio switch for models that support it. */
  nativeAudioEnabled?: boolean;
  linkedImageUrl?: string;
  referenceImageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
  /**
   * Seedance 2 / Fast only: motion reference URLs for `omni_reference` (not passed through image min-edge).
   * Provider allows at most one video; extras are ignored after dedupe.
   */
  referenceVideoUrls?: string[];
  onTaskStarted?: (taskId: string) => void;
  workflowRunCorrelationId?: string | null;
};

/** True when the picker accepts a discrete first-frame image (image-to-video / first+last). */
export function workflowVideoModelHasStartFrame(modelId: string): boolean {
  const normalized = normalizeLegacySeedanceMarketModelId(modelId);
  if (normalized === "bytedance/seedance-1.5-pro") return true;
  // Seedance 2 / Fast: we accept start/end frames as part of omni_reference media set.
  if (normalized === "bytedance/seedance-2" || normalized === "bytedance/seedance-2-fast") return true;
  if (modelId.startsWith("bytedance/seedance")) return false;
  return true;
}

/** True when the picker accepts a discrete last-frame image. */
export function workflowVideoModelHasEndFrame(modelId: string): boolean {
  const normalized = normalizeLegacySeedanceMarketModelId(modelId);
  if (normalized === "bytedance/seedance-1.5-pro") return true;
  // Seedance 2 / Fast: end frame is allowed as part of omni_reference media set.
  if (normalized === "bytedance/seedance-2" || normalized === "bytedance/seedance-2-fast") return true;
  if (modelId === "kling-3.0/video") return true;
  if (modelId === "veo3" || modelId === "veo3_fast" || modelId === "veo3_lite") return true;
  return false;
}

/**
 * True when another node's video output can wire into this generator's Start / End image ports (frame extraction).
 * Models without those ports (e.g. references-only Seedance) cannot consume a chained full clip this way.
 */
export function workflowVideoGeneratorAcceptsUpstreamVideo(rawModel: string): boolean {
  const modelId = resolveWorkflowVideoModelId(rawModel);
  return workflowVideoModelHasStartFrame(modelId) || workflowVideoModelHasEndFrame(modelId);
}

/** True when the picker accepts extra reference images (Kling 3.0 elements / Seedance refs). */
export function workflowVideoModelHasReferences(modelId: string): boolean {
  if (modelId === "kling-3.0/video") return true;
  const n = normalizeLegacySeedanceMarketModelId(modelId);
  if (n === "bytedance/seedance-1.5-pro") return false;
  if (modelId.startsWith("bytedance/seedance")) return true;
  return false;
}

/** True when the picker resolves @name mentions to an `kling_elements` payload server-side. */
export function workflowVideoModelSupportsElements(modelId: string): boolean {
  if (modelId === "kling-3.0/video") return true;
  const n = normalizeLegacySeedanceMarketModelId(modelId);
  if (n === "bytedance/seedance-2" || n === "bytedance/seedance-2-fast") return true;
  return false;
}

const SEEDANCE_PRO_REF_LIMIT = 12;
const WORKFLOW_VIDEO_RETRY_ATTEMPTS = 4;
const WORKFLOW_VIDEO_RETRY_BASE_DELAY_MS = 1200;

function dedupeKeepOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** When true, URLs from this wired input contribute to `@imageN` allowance (batch index 0). */
export function workflowVideoElementInputHandleAffectsImageMentions(
  targetHandle: string | null | undefined,
  workflowModelPickerValue: string,
): boolean {
  const h = (targetHandle ?? "").trim();
  if (!h) return false;
  const m = normalizeLegacySeedanceMarketModelId(resolveWorkflowVideoModelId(workflowModelPickerValue));
  // Only Seedance 2 / 2 Fast actually consume `@imageN` mentions in the workflow:
  // - Seedance accepts 1 URL per ref and binds @image1, @image2, … positionally via `reference_image_urls`.
  // - Kling 3.0 requires **2–4 URLs per element**, which the workflow can't satisfy from its
  //   one-image-per-port pool, so we don't auto-emit @imageN tags for Kling 3.0 anymore.
  //   Kling 3.0 still gets first/last frame via `image_urls` (start + optional end frame).
  const isSeedancePro = m === "bytedance/seedance-2" || m === "bytedance/seedance-2-fast";
  if (!isSeedancePro) return false;
  if (h === "startImage" || h === "references" || h === "inImage") return true;
  if (h === "endImage") return true;
  return false;
}

/**
 * Ordered reference URLs mapped to `@image1`, `@image2`, … — mirrors Video Generator batch index `0`
 * in `AdAssetNode` / `runWorkflowVideoJob` (`seedanceMergedImageUrls` vs Kling elements pool).
 */
export function workflowVideoOrderedElementImageRefs(params: {
  modelPickerValue: string;
  nodes: Node[];
  edges: Edge[];
  videoNodeId: string;
  data: Pick<
    AdAssetNodeData,
    "referenceMediaKind" | "referencePreviewUrl" | "videoStartImageUrl" | "videoEndImageUrl"
  >;
}): string[] {
  const modelId = resolveWorkflowVideoModelId(params.modelPickerValue);
  if (!workflowVideoModelSupportsElements(modelId)) return [];

  const { nodes, edges, videoNodeId, data } = params;

  const linkedFromStartPortStrict = collectLinkedImageUrlsForHandles(nodes, edges, videoNodeId, [
    "startImage",
    "startImageAlt",
  ]);
  const linkedFromEndPort = collectLinkedImageUrlsForHandles(nodes, edges, videoNodeId, ["endImage"]);
  const linkedFromReferencesPortStrict = collectLinkedImageUrlsForHandles(nodes, edges, videoNodeId, [
    "references",
  ]);
  const linkedFromLegacyImagePorts = collectLinkedImageUrlsForHandles(nodes, edges, videoNodeId, ["inImage"]);
  const linkedFromStartPort =
    linkedFromStartPortStrict.length > 0 ? linkedFromStartPortStrict : linkedFromLegacyImagePorts;
  const linkedFromReferencesPort =
    linkedFromReferencesPortStrict.length > 0 ? linkedFromReferencesPortStrict : linkedFromLegacyImagePorts;

  const nodeRefUrl =
    data.referenceMediaKind === "image" && data.referencePreviewUrl?.trim()
      ? data.referencePreviewUrl.trim()
      : "";

  const startFrame =
    (data.videoStartImageUrl?.trim() || linkedFromStartPort[0] || nodeRefUrl || "").trim() || undefined;

  const endFrame = (data.videoEndImageUrl?.trim() || linkedFromEndPort[0] || "").trim() || undefined;

  const referencePool = [...linkedFromReferencesPort];
  if (nodeRefUrl && startFrame !== nodeRefUrl && !referencePool.includes(nodeRefUrl)) {
    referencePool.push(nodeRefUrl);
  }

  const referenceOnly = Array.from(new Set(referencePool.filter(Boolean))).filter(
    (u) => u !== startFrame && u !== endFrame,
  );

  const indexedStartImages =
    linkedFromStartPort.length > 0
      ? linkedFromStartPort
      : linkedFromReferencesPort.length > 0
        ? linkedFromReferencesPort
        : [];

  const pickByIndex = (arr: string[], idx: number, fallback: string | undefined): string | undefined => {
    if (!arr.length) return fallback;
    const clamped = idx >= arr.length ? arr[arr.length - 1] : arr[idx];
    const chosen = clamped?.trim();
    return chosen || fallback;
  };

  const batchIdx = 0;
  const indexedStartFrame = pickByIndex(indexedStartImages, batchIdx, startFrame);
  const indexedReferenceOnly = referenceOnly.filter((u) => u !== indexedStartFrame && u !== endFrame);

  const startUrl = indexedStartFrame;
  const seedanceNormalized = normalizeLegacySeedanceMarketModelId(modelId);
  const seedanceKie =
    seedanceNormalized === "bytedance/seedance-2" || seedanceNormalized === "bytedance/seedance-2-fast";

  if (seedanceKie) {
    return dedupeKeepOrder(
      [startUrl, endFrame, ...indexedReferenceOnly].filter((u): u is string => Boolean(u && u.trim())),
    ).slice(0, SEEDANCE_PRO_REF_LIMIT);
  }

  return dedupeKeepOrder([startUrl, ...indexedReferenceOnly].filter((u): u is string => Boolean(u && u.trim())));
}

/** Appends `@image1` … `@imageN` (only indices missing from the prompt) at the end. */
export function appendMissingWorkflowVideoElementImageTags(prompt: string, neededSlots: number): string {
  const nNeeds = Number(neededSlots);
  if (!Number.isFinite(nNeeds) || nNeeds <= 0) return prompt;
  const existing = new Set<number>();
  const re = /@image(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) existing.add(n);
  }
  const missing: string[] = [];
  for (let i = 1; i <= nNeeds; i++) {
    if (!existing.has(i)) missing.push(`@image${i}`);
  }
  if (!missing.length) return prompt;
  const base = prompt.replace(/\s*$/, "");
  return base.length ? `${base} ${missing.join(" ")}` : missing.join(" ");
}

function maxPromptImageMention(prompt: string): number {
  let max = 0;
  const re = /@image(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function maxPromptVideoMention(prompt: string): number {
  let max = 0;
  const re = /@video(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function promptHasUnsupportedElementMentions(prompt: string): boolean {
  const p = (prompt ?? "").trim();
  if (!p.includes("@")) return false;
  const re = /@([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const token = (m[1] ?? "").toLowerCase();
    if (/^image\d+$/.test(token)) continue;
    if (/^video\d+$/.test(token)) continue;
    if (/^audio\d+$/.test(token)) continue;
    return true;
  }
  return false;
}

function workflowVideoDebugContext(args: {
  modelId: string;
  marketModel: string;
  duration: number;
  aspectRatio?: string;
  prompt: string;
  startUrl?: string;
  endUrl?: string;
  refUrls: string[];
  seedancePreviewImageUrls: string[];
  seedanceProImageUrls: string[];
  seedanceProVideoUrlsCount: number;
  klingElementsCount: number;
}): string {
  const promptTrim = args.prompt.trim();
  const mentionMax = maxPromptImageMention(promptTrim);
  return [
    `model=${args.modelId}`,
    `marketModel=${args.marketModel}`,
    `duration=${args.duration}s`,
    `aspect=${args.aspectRatio ?? "auto"}`,
    `promptChars=${promptTrim.length}`,
    `promptImageMentionsMax=${mentionMax}`,
    `start=${args.startUrl ? "yes" : "no"}`,
    `end=${args.endUrl ? "yes" : "no"}`,
    `references=${args.refUrls.length}`,
    `seedancePreviewRefs=${args.seedancePreviewImageUrls.length}`,
    `seedanceOmniImageRefs=${args.seedanceProImageUrls.length}`,
    `seedanceOmniVideoRefs=${args.seedanceProVideoUrlsCount}`,
    `klingElements=${args.klingElementsCount}`,
  ].join(", ");
}

export type WorkflowRunMotionControlParams = {
  planId: AccountPlanId;
  personalApiKey?: string;
  prompt?: string;
  motionFamily: "kling-3.0" | "kling-2.6";
  quality: "720p" | "1080p";
  imageUrl: string;
  videoUrl: string;
  backgroundSource?: "input_video" | "input_image";
  onTaskStarted?: (taskId: string) => void;
  workflowRunCorrelationId?: string | null;
};

export async function probeWorkflowVideoDurationSec(url: string): Promise<number | null> {
  const u = url.trim();
  if (!u || typeof window === "undefined") return null;
  return await new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    let settled = false;
    const finish = (v: number | null) => {
      if (settled) return;
      settled = true;
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        /* noop */
      }
      resolve(v);
    };
    const onLoaded = () => {
      const d = Number(video.duration);
      if (Number.isFinite(d) && d > 0) finish(d);
      else finish(null);
    };
    const onErr = () => finish(null);
    const t = window.setTimeout(() => finish(null), 6000);
    video.addEventListener("loadedmetadata", () => {
      window.clearTimeout(t);
      onLoaded();
    }, { once: true });
    video.addEventListener("error", () => {
      window.clearTimeout(t);
      onErr();
    }, { once: true });
    video.src = u;
  });
}

export async function runWorkflowMotionControlJob(
  params: WorkflowRunMotionControlParams,
): Promise<{ videoUrl: string; taskId: string; inputDurationSec: number }> {
  const pKey = params.personalApiKey?.trim() || undefined;
  if (!pKey && !canUseMotionControl(params.planId)) {
    throw new Error(motionControlUpgradeMessage(params.planId) ?? "Subscription upgrade required for Motion Control.");
  }
  const imageUrl = await ensureWorkflowImageMinEdge(await resolveLocalWorkflowMediaUrlForServer(params.imageUrl));
  const videoUrl = await resolveLocalWorkflowMediaUrlForServer(params.videoUrl);
  const inputDurationSec = await probeWorkflowVideoDurationSec(videoUrl);
  if (inputDurationSec == null || inputDurationSec < 3 || inputDurationSec > 30) {
    throw new Error("Motion reference video must be between 3 and 30 seconds.");
  }

  const motionPrompt = params.prompt?.trim() || undefined;
  const { blocked, response: res } = await guardedFetch("/api/kling/motion-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountPlan: params.planId,
      motionFamily: params.motionFamily,
      imageUrl,
      videoUrl,
      quality: params.quality,
      backgroundSource: params.backgroundSource ?? "input_video",
      prompt: motionPrompt,
      personalApiKey: pKey,
    }),
  });
  if (blocked) throw new Error("INSUFFICIENT_CREDITS");
  const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
  if (!res.ok || !json.taskId) throw new Error(json.error || "Motion control failed");
  params.onTaskStarted?.(json.taskId);
  const credits = calculateMotionControlCreditsFromDuration(inputDurationSec, params.quality);
  await registerStudioVideoTask({
    label: workflowHistoryStorageLabel(motionPrompt || "Motion control", params.workflowRunCorrelationId),
    taskId: json.taskId,
    provider: json.provider,
    model: params.motionFamily === "kling-2.6" ? "kling-2.6/motion-control" : "kling-3.0/motion-control",
    creditsCharged: credits,
    personalApiKey: pKey,
    inputUrls: [imageUrl, videoUrl],
  });
  const polledVideoUrl = await pollKlingVideo(json.taskId, pKey);
  const finalUrl = await completeStudioGenerationTask(json.taskId, polledVideoUrl);
  return { videoUrl: finalUrl, taskId: json.taskId, inputDurationSec };
}

/**
 * Same retry contract as {@link runWorkflowImageJob}: when Kie reports the task is
 * terminally dead with a transient cause (e.g. "Service is currently unavailable
 * due to high demand. (E003)"), we re-submit a fresh task up to 5 times.
 */
const WORKFLOW_VIDEO_TASK_RETRY_MAX_ATTEMPTS = 5;
const WORKFLOW_VIDEO_TASK_RETRY_BASE_DELAY_MS = 6_000;

function workflowVideoTaskRetryDelayMs(attempt: number): number {
  // ~6s, 12s, 18s, 24s with ±20% jitter — slightly longer than image because video
  // start endpoints already have their own short retry on transient HTTP errors.
  const base = WORKFLOW_VIDEO_TASK_RETRY_BASE_DELAY_MS * (attempt + 1);
  const jitter = base * 0.2;
  return Math.max(2_000, Math.floor(base + (Math.random() * 2 - 1) * jitter));
}

function isRetryableVideoTaskMessage(message: string): boolean {
  if (!message) return false;
  if (isTaskTerminallyDeadButRetryable(message)) return true;
  // Reuse the broader image transient list — they cover the same provider error shapes.
  if (isImagePollTransientMessage(message)) return true;
  return false;
}

export async function runWorkflowVideoJob(params: WorkflowRunVideoParams): Promise<{ videoUrl: string; taskId: string }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < WORKFLOW_VIDEO_TASK_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await runWorkflowVideoJobOnce(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      // Never retry insufficient-credits or plan-gate errors.
      if (
        message === "INSUFFICIENT_CREDITS" ||
        /subscription upgrade required/i.test(message) ||
        /motion reference video must be between/i.test(message) ||
        /this model needs a reference image/i.test(message) ||
        /elements can not be used inside this model/i.test(message) ||
        /prompt references @(image|video)\d+/i.test(message)
      ) {
        throw err instanceof Error ? err : new Error(message);
      }
      lastError = err instanceof Error ? err : new Error(message);
      if (!isRetryableVideoTaskMessage(message)) {
        throw lastError;
      }
      if (attempt >= WORKFLOW_VIDEO_TASK_RETRY_MAX_ATTEMPTS - 1) break;
      const waitMs = workflowVideoTaskRetryDelayMs(attempt);
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[workflow.video] retrying video job after transient error", {
          attempt: attempt + 1,
          maxAttempts: WORKFLOW_VIDEO_TASK_RETRY_MAX_ATTEMPTS,
          waitMs,
          message,
        });
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw (
    lastError ??
    new Error(
      `Video generation failed after ${WORKFLOW_VIDEO_TASK_RETRY_MAX_ATTEMPTS} attempts. The provider is overloaded — please try again in a moment.`,
    )
  );
}

async function runWorkflowVideoJobOnce(params: WorkflowRunVideoParams): Promise<{ videoUrl: string; taskId: string }> {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const pKey = params.personalApiKey;
  const piKey = params.piapiApiKey;
  const startRaw = params.referenceImageUrl?.trim() || params.linkedImageUrl?.trim() || "";
  const startResolvedUrl = startRaw ? await resolveLocalWorkflowMediaUrlForServer(startRaw) : undefined;
  const endRaw = params.endImageUrl?.trim() || "";
  const endResolvedUrl = endRaw ? await resolveLocalWorkflowMediaUrlForServer(endRaw) : undefined;
  const resolvedRefUrls = await resolveLocalWorkflowMediaUrlsForServer(
    (params.referenceImageUrls ?? []).map((u) => u.trim()).filter(Boolean),
  );
  const resolvedRefVideoRaw = (params.referenceVideoUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const resolvedRefVideos = resolvedRefVideoRaw.length
    ? await resolveLocalWorkflowMediaUrlsForServer(resolvedRefVideoRaw)
    : [];
  const softNormalizeVideoRefImage = async (
    rawUrl: string | undefined,
    label: "start" | "end" | "reference",
  ): Promise<string | undefined> => {
    const t = rawUrl?.trim();
    if (!t) return undefined;
    try {
      return await ensureWorkflowImageMinEdge(t);
    } catch (err) {
      // Do not hard-fail non-Seedance runs when an optional cached/stale image URL 404s.
      // We skip invalid refs and continue (e.g. Kling 2.5 text-to-video fallback).
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[workflow.video] dropped invalid reference image before provider start", {
          modelId,
          label,
          url: t.slice(0, 180),
          error: err instanceof Error ? err.message : String(err ?? ""),
        });
      }
      return undefined;
    }
  };
  const startUrl = await softNormalizeVideoRefImage(startResolvedUrl, "start");
  const endUrl = await softNormalizeVideoRefImage(endResolvedUrl, "end");
  const refUrls: string[] = [];
  for (const u of resolvedRefUrls) {
    const normalized = await softNormalizeVideoRefImage(u, "reference");
    if (normalized) refUrls.push(normalized);
  }
  const quality = klingQualityFromVideoResolution(params.resolution);
  const duration = coerceWorkflowVideoDurationSec(params.model, params.durationSec);
  const seedanceResolvedModel = normalizeLegacySeedanceMarketModelId(modelId);
  const marketModelForGenerate = seedanceResolvedModel;
  try {
    validateStudioVideoJobDuration(marketModelForGenerate, duration);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Invalid video duration.");
  }
  const seedanceRes = workflowSeedanceVideoResolution(params.resolution);
  const seedanceResForCredits =
    seedanceResolvedModel === "bytedance/seedance-2-fast" && seedanceRes === "1080p"
      ? "720p"
      : seedanceRes;
  const baseCredits = calculateVideoCredits({
    modelId: seedanceResolvedModel,
    duration,
    audio:
      modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video"
        ? params.nativeAudioEnabled ?? true
        : false,
    quality,
    videoResolution: modelId.startsWith("bytedance/seedance") ? seedanceResForCredits : undefined,
  });
  const credits = baseCredits;

  /**
   * Seedance 2.0 / 2.0 Fast: fold wired start/end/extra refs into `seedanceOmniMedia`
   * (images + optional motion-reference videos). Legacy Preview picker ids normalize to these models.
   *
   * Provider note: per docs.kie.ai/market/bytedance/seedance-2, **First & Last Frames mode**
   * (`first_frame_url` + `last_frame_url`) and **Multimodal Reference mode**
   * (`reference_image_urls` / `reference_video_urls`) are mutually exclusive. When the user only
   * wired a start (and optionally end) frame — no extra refs and no reference videos — we route
   * through `imageUrl` / `endImageUrl` so the route actually uses the dedicated first/last frame
   * fields. Otherwise we stay on omni references.
   */
  const seedance15Kie = seedanceResolvedModel === "bytedance/seedance-1.5-pro";
  const seedanceKie =
    seedanceResolvedModel === "bytedance/seedance-2" ||
    seedanceResolvedModel === "bytedance/seedance-2-fast";
  const seedanceMergedImageUrls = seedanceKie
    ? dedupeKeepOrder(
        [startUrl, endUrl, ...refUrls].filter((u): u is string => Boolean(u && u.trim())),
      ).slice(0, SEEDANCE_PRO_REF_LIMIT)
    : [];
  const seedanceMergedVideoUrls = seedanceKie
    ? dedupeKeepOrder(resolvedRefVideos.filter((u) => Boolean(u?.trim()))).slice(0, SEEDANCE_PRO_MAX_VIDEO_URLS)
    : [];

  // First/last frame routing (mutually exclusive with omni refs on the provider side).
  // We require either a startUrl or endUrl, AND no extra refs / videos so we don't lose
  // information by switching modes.
  const seedanceUseFirstLastFrames =
    seedanceKie &&
    refUrls.length === 0 &&
    seedanceMergedVideoUrls.length === 0 &&
    Boolean(startUrl || endUrl);

  const seedanceOmniMedia =
    seedanceKie &&
    !seedanceUseFirstLastFrames &&
    (seedanceMergedImageUrls.length > 0 || seedanceMergedVideoUrls.length > 0)
      ? [
          ...seedanceMergedImageUrls.map((url) => ({ type: "image" as const, url })),
          ...seedanceMergedVideoUrls.map((url) => ({ type: "video" as const, url })),
        ]
      : undefined;

  if (
    isSeedancePicker(modelId) &&
    !startUrl &&
    seedanceMergedImageUrls.length === 0 &&
    seedanceResolvedModel !== "bytedance/seedance-2" &&
    seedanceResolvedModel !== "bytedance/seedance-2-fast" &&
    seedanceResolvedModel !== "bytedance/seedance-1.5-pro"
  ) {
    throw new Error("This model needs a reference image. Connect an image module or set a reference on the node.");
  }

  if (isVeoPicker(modelId)) {
    const veoModel = normalizeKieVeoModel(modelId);
    if (!pKey && !canUseVeoApiModel(params.planId, veoModel)) {
      throw new Error(veoUpgradeMessage(params.planId, veoModel) ?? "Subscription upgrade required for Veo.");
    }
    const veoAspect = veoAspectFromWorkflowAspect(params.aspectRatio);
    const { blocked, response: res } = await guardedFetch("/api/kie/veo/generate", {
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
    if (blocked) throw new Error("INSUFFICIENT_CREDITS");
    const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
    if (!res.ok || !json.taskId) throw new Error(json.error || "Veo failed");
    params.onTaskStarted?.(json.taskId);
    await registerStudioVideoTask({
      label: workflowHistoryStorageLabel(params.prompt, params.workflowRunCorrelationId),
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

  /**
   * Auto-bind references to `@imageN` mentions in the prompt. We always emit the elements
   * payload, even when the prompt does not yet `@image1`, so saved Seedance workflows still
   * receive their reference images and any ad-hoc `@imageN` typed by the user resolves cleanly.
   *
   * Important: Kling 3.0 requires **2–4 URLs per element** (provider validation), which the
   * workflow can't satisfy because each wired image port produces a single URL. So we do NOT
   * synthesize `kling_elements` for Kling 3.0 here — the workflow still passes the start/end
   * frame via `image_urls` and the user can add named refs through Studio if they need them.
   */
  const supportsAutoElements = workflowVideoModelSupportsElements(modelId);
  const elementsRefPool: string[] = supportsAutoElements
    ? dedupeKeepOrder(
        [startUrl, ...refUrls].filter((u): u is string => Boolean(u && u.trim())),
      )
    : [];
  // Provider needs 2-4 URLs per element (https://docs.kie.ai/market/kling/kling-3-0). The
  // workflow only has 1 URL per wired image port, so we never auto-emit elements anymore.
  let klingElements: { name: string; element_input_urls: string[] }[] | undefined;

  const promptTrimmed = params.prompt.trim();
  if (!supportsAutoElements && promptHasUnsupportedElementMentions(promptTrimmed)) {
    throw new Error("elements can not be used inside this model, please use seedance 2 or kling 3.0");
  }
  const promptImageMentionMax = maxPromptImageMention(promptTrimmed);
  const availableImageRefsForMentions = (() => {
    if (seedanceKie) return seedanceMergedImageUrls.length;
    if (isKling30) return elementsRefPool.length;
    return 0;
  })();
  const availableVideoRefsForMentions = seedanceKie ? seedanceMergedVideoUrls.length : 0;
  if (promptImageMentionMax > 0 && availableImageRefsForMentions < promptImageMentionMax) {
    throw new Error(
      `Prompt references @image${promptImageMentionMax}, but only ${availableImageRefsForMentions} image reference${
        availableImageRefsForMentions === 1 ? "" : "s"
      } are connected. Connect more reference images or reduce @imageN mentions.`,
    );
  }
  const promptVideoMentionMax = maxPromptVideoMention(promptTrimmed);
  if (promptVideoMentionMax > 0 && availableVideoRefsForMentions < promptVideoMentionMax) {
    throw new Error(
      `Prompt references @video${promptVideoMentionMax}, but only ${availableVideoRefsForMentions} video reference${
        availableVideoRefsForMentions === 1 ? "" : "s"
      } are connected. Add a reference video or reduce @videoN mentions.`,
    );
  }

  const debugContext = workflowVideoDebugContext({
    modelId,
    marketModel: marketModelForGenerate,
    duration,
    aspectRatio: aspectForApi,
    prompt: params.prompt,
    startUrl,
    endUrl,
    refUrls,
    seedancePreviewImageUrls: [],
    seedanceProImageUrls: seedanceMergedImageUrls,
    seedanceProVideoUrlsCount: seedanceMergedVideoUrls.length,
    klingElementsCount: klingElements?.length ?? 0,
  });

  /**
   * Retry once on transient provider failures (PiAPI Seedance 502, KIE timeouts) so the
   * workflow does not surface a hard error every time the upstream service hiccups.
   */
  let genJson: { taskId?: string; provider?: string; error?: string } | undefined;
  let lastStatus = 0;
  for (let attempt = 0; attempt < WORKFLOW_VIDEO_RETRY_ATTEMPTS; attempt++) {
    const promptForAttempt = params.prompt;
    const generatePayload = {
      accountPlan: params.planId,
      marketModel: marketModelForGenerate,
      prompt: promptForAttempt,
      imageUrl: seedance15Kie
        ? startUrl
        : seedanceKie
          ? seedanceUseFirstLastFrames
            ? startUrl
            : undefined
          : startUrl ?? refUrls[0],
      endImageUrl: seedance15Kie
        ? endUrl
        : seedanceKie
          ? seedanceUseFirstLastFrames
            ? endUrl
            : undefined
          : endUrl,
      seedancePreviewImageUrls: undefined,
      seedanceOmniMedia,
      klingElements,
      duration,
      aspectRatio: aspectForApi,
      /** Seedance — workflow resolution maps to provider tiers (Fast caps at 720p server-side). */
      videoResolution: modelId.startsWith("bytedance/seedance")
        ? workflowVideoResolutionToPiapiSeedance(params.resolution)
        : undefined,
      sound:
        modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video"
          ? (params.nativeAudioEnabled ?? true)
          : undefined,
      mode: isKling30 || isKling25Turbo || isKling26 || isSoraPicker ? quality : undefined,
      multiShots: isKling30 ? false : undefined,
      personalApiKey: pKey,
      piapiApiKey: piKey,
    };
    const { blocked: genBlocked, response: genRes } = await guardedFetch("/api/kling/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generatePayload),
    });
    if (genBlocked) throw new Error("INSUFFICIENT_CREDITS");
    lastStatus = genRes.status;
    genJson = (await genRes.json().catch(() => ({}))) as {
      taskId?: string;
      provider?: string;
      error?: string;
    };
    if (genRes.ok && genJson.taskId) break;
    if (typeof console !== "undefined" && typeof console.error === "function") {
      const debugPayload = {
        ...generatePayload,
        personalApiKey: generatePayload.personalApiKey ? "[redacted]" : undefined,
        piapiApiKey: generatePayload.piapiApiKey ? "[redacted]" : undefined,
      };
      console.error("[workflow.video] /api/kling/generate failed", {
        status: genRes.status,
        attempt,
        promptChars: promptForAttempt.trim().length,
        error: genJson.error,
        modelId,
        marketModel: marketModelForGenerate,
        payload: debugPayload,
      });
    }
    const errLower = (genJson.error ?? "").toLowerCase();
    const transient =
      genRes.status === 502 ||
      genRes.status === 503 ||
      genRes.status === 504 ||
      /timeout|timed out|aborted|temporar|try again|gateway|fetch failed|network/.test(errLower);
    if (!transient || attempt >= WORKFLOW_VIDEO_RETRY_ATTEMPTS - 1) {
      const rawErr = (genJson.error ?? "").trim();
      const promptTooLong = /prompt exceeds maximum length|prompt too long|max(imum)? length/i.test(rawErr);
      if (promptTooLong) {
        const chars = promptForAttempt.trim().length;
        throw new Error(
          `Kling rejected the prompt length (${chars.toLocaleString("en-US")} chars). ` +
          "Shorten this prompt and retry.",
        );
      }
      const tooGeneric =
        !rawErr ||
        /invalid parameters or inputs|bad request|video task failed|unknown error|something went wrong/i.test(rawErr);
      const summary = tooGeneric
        ? `Video generation request was rejected before task creation (HTTP ${
            lastStatus || "unknown"
          }). Check prompt, references, duration, and model constraints.`
        : rawErr;
      throw new Error(`${summary} [${debugContext}]`);
    }
    await new Promise((r) =>
      setTimeout(r, WORKFLOW_VIDEO_RETRY_BASE_DELAY_MS + attempt * WORKFLOW_VIDEO_RETRY_BASE_DELAY_MS),
    );
  }
  if (!genJson?.taskId) {
    const rawErr = (genJson?.error ?? "").trim();
    const tooGeneric =
      !rawErr || /invalid parameters or inputs|bad request|video task failed|unknown error|something went wrong/i.test(rawErr);
    const summary = tooGeneric
      ? `Video generation failed before provider task start (HTTP ${lastStatus || "unknown"}).`
      : rawErr;
    throw new Error(`${summary} [${debugContext}]`);
  }
  params.onTaskStarted?.(genJson.taskId);

  const registerInputUrls = (() => {
    if (seedanceKie && (seedanceMergedImageUrls.length > 0 || seedanceMergedVideoUrls.length > 0)) {
      return [...seedanceMergedImageUrls, ...seedanceMergedVideoUrls];
    }
    if (startUrl) return [startUrl];
    if (refUrls[0]) return [refUrls[0]];
    return undefined;
  })();
  await registerStudioVideoTask({
    label: workflowHistoryStorageLabel(params.prompt, params.workflowRunCorrelationId),
    taskId: genJson.taskId,
    provider: genJson.provider,
    model: modelId,
    creditsCharged: credits,
    personalApiKey: pKey,
    piapiApiKey: piKey,
    inputUrls: registerInputUrls,
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
  nativeAudioEnabled?: boolean;
}): number {
  const modelId = resolveWorkflowVideoModelId(params.model);
  const seedanceResolved = normalizeLegacySeedanceMarketModelId(modelId);
  const quality = klingQualityFromVideoResolution(params.resolution);
  const duration = coerceWorkflowVideoDurationSec(params.model, params.durationSec);
  const seedanceRes = workflowSeedanceVideoResolution(params.resolution);
  const seedanceResForCredits =
    seedanceResolved === "bytedance/seedance-2-fast" && seedanceRes === "1080p" ? "720p" : seedanceRes;
  return calculateVideoCredits({
    modelId: seedanceResolved,
    duration,
    audio:
      modelId === "kling-3.0/video" || modelId === "kling-2.5-turbo/video" || modelId === "kling-2.6/video"
        ? params.nativeAudioEnabled ?? true
        : false,
    quality,
    videoResolution: modelId.startsWith("bytedance/seedance") ? seedanceResForCredits : undefined,
  });
}

export function workflowMotionControlChargeCredits(params: { quality: string; durationSec: number }): number {
  return calculateMotionControlCreditsFromDuration(params.durationSec, params.quality);
}

/** Estimate credits for one runnable adAsset node from current graph wiring. */
export function estimateWorkflowAdAssetRunCredits(
  data: AdAssetNodeData,
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): number {
  if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") return 0;

  const prompt = (data.prompt ?? "").trim();
  const { batch } = collectWorkflowBatchPrompts(nodes, edges, nodeId, ["text", "inText"], prompt);
  const batchPromptCount = batch?.length ?? 0;
  const runCount = Math.max(1, batchPromptCount);
  const multiBatchFromList = batchPromptCount > 1;
  // Only image jobs support quantity fan-out; video/motion always run once per prompt.
  let quantity = Math.min(10, Math.max(1, data.quantity ?? 1));

  if (data.kind === "image") {
    const isAvatar360Preset = data.imageWorkflowPreset === "profile_360";
    const rawModel = (data.model ?? "nano").trim() || "nano";
    const avatar360Models = new Set<string>(WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS);
    const model = isAvatar360Preset
      ? avatar360Models.has(rawModel)
        ? rawModel
        : WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL
      : rawModel;
    const rawRes = (data.resolution ?? "1024").trim();
    let resolution = rawRes === "1024" ? "1K" : rawRes === "1536" ? "2K" : rawRes;
    if (isAvatar360Preset) {
      quantity = 1;
      if (!["1K", "2K", "4K"].includes(resolution)) resolution = "1K";
    }
    if (quantity > 1 && !multiBatchFromList) {
      const oneNode = workflowImageChargeCredits({ model, resolution, quantity: 1 });
      return oneNode * quantity * runCount;
    }
    return workflowImageChargeCredits({ model, resolution, quantity }) * runCount;
  }

  if (data.kind === "motion") {
    const oneVideo = workflowMotionControlChargeCredits({
      quality: (data.resolution ?? "1080p").trim(),
      durationSec: Math.max(0, Number(data.motionInputDurationSec) || 10),
    });
    return oneVideo * runCount;
  }

  const model = (data.model ?? "kling-3.0/video").trim() || "kling-3.0/video";
  const resolution = (data.resolution ?? "720p").trim() || "720p";
  const oneVideo = workflowVideoChargeCredits({
    model,
    resolution,
    durationSec: data.videoDurationSec,
    nativeAudioEnabled: data.videoNativeAudioEnabled,
  });
  void multiBatchFromList;
  quantity = 1;
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
