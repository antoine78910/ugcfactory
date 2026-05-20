"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type IsValidConnection,
  type OnConnectStartParams,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type XYPosition,
} from "@xyflow/react";
import {
  Braces,
  ChevronDown,
  Clapperboard,
  Copy,
  CopyPlus,
  Eye,
  Globe2,
  GripVertical,
  Hand,
  Image as ImageIconLucide,
  ImageUpscale,
  LayoutGrid,
  Layers,
  Lock,
  MessageSquare,
  ListOrdered,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Share2,
  Shapes,
  Sparkles,
  SquareStack,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserRound,
  Loader2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";

import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { clipboardImageFiles } from "@/lib/clipboardImage";
import { compressImageFileForUpload } from "@/lib/compressImageFileForUpload";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { AdAssetNode, type AdAssetNodeData } from "./nodes/AdAssetNode";
import { ImageRefNode, type ImageRefNodeData, type ImageRefNodeType } from "./nodes/ImageRefNode";
import { StickyNoteNode } from "./nodes/StickyNoteNode";
import { TextPromptNode, type TextPromptNodeData } from "./nodes/TextPromptNode";
import { PromptListNode, type PromptListNodeData } from "./nodes/PromptListNode";
import {
  GROUP_COLOR_PRESETS,
  WorkflowGroupNode,
  type WorkflowGroupNodeData,
  type WorkflowGroupNodeType,
} from "./nodes/WorkflowGroupNode";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import { storeInviteWelcome } from "./WorkflowInviteWelcome";
import { WorkflowOnboarding, starterNodeForKind, type WorkflowStarterKind } from "./WorkflowOnboarding";
import {
  defaultWorkflowProject,
  migrateImageGeneratorOutEdgesToGenerated,
  newPage,
  shouldShowWorkflowOnboarding,
  type WorkflowProjectStateV1,
} from "./workflowProjectStorage";
import { buildWorkflowPreviewDataUrl } from "./workflowPreviewRenderer";
import {
  createSpace,
  createSpaceFromTemplate,
  getWorkflowStorageScope,
  loadProjectForSpace,
  loadSpacesIndex,
  saveProjectForSpace,
  updateSpaceMeta,
} from "./workflowSpacesStorage";
import {
  fetchCloudWorkflowSpace,
  fetchWorkflowSharePreview,
  saveCloudWorkflowSpace,
} from "./workflowSpacesCloud";
import {
  buildTemplateProject,
  getWorkflowTemplateMeta,
  parseWorkflowCommunityTemplateUuid,
} from "./workflowTemplates";
import {
  extractWorkflowThumbnailUrl,
  projectHasAnyNode,
  sanitizeProjectForCommunityTemplate,
} from "./workflowTemplateSanitizer";
import { WorkflowNodePatchProvider } from "./workflowNodePatchContext";
import { ShareWorkflowDialog } from "./ShareWorkflowDialog";
import { WorkflowInviteWelcome } from "./WorkflowInviteWelcome";
import {
  suggestAutoConnectAfterNodeDrag,
  WORKFLOW_CONNECTION_RADIUS,
} from "./workflowAutoConnect";
import { canCloneWorkflowSelection, cloneWorkflowSelection } from "./workflowClone";
import {
  buildWorkflowClipboardPayload,
  parseWorkflowClipboardText,
  remapPastedWorkflowPayload,
  removeWorkflowNodesById,
  writeWorkflowClipboardPayload,
  type WorkflowClipboardPayloadV1,
} from "./workflowClipboard";
import {
  buildAdAssetNode,
  buildImageRefNode,
  buildPromptListNode,
  buildStickyNoteNode,
  buildTextPromptNode,
  WORKFLOW_NODE_DND,
  type BuildAdAssetNodeOptions,
  type WorkflowDragNodeKind,
} from "./workflowNodeFactory";
import {
  buildWorkflow360ProfileBranch,
  buildWorkflowImageToJsonBranch,
  buildWorkflowVideoToPromptBranch,
} from "./workflowProjectPipeline";
import { WORKFLOW_IMAGE_TO_JSON_USER_PROMPT } from "./workflowImageToJsonPreset";
import { WORKFLOW_VIDEO_TO_PROMPT_USER_PROMPT } from "./workflowVideoToPromptPreset";
import {
  isVideoFile,
  measureImageAspectFromObjectUrl,
  measureImageAspectFromUrlSafe,
  measureVideoAspectFromObjectUrl,
} from "./workflowMediaAspect";
import type { StickyNoteNodeData } from "./workflowStickyNoteTypes";
import {
  appendMissingWorkflowVideoElementImageTags,
  estimateWorkflowAdAssetRunCredits,
  resolveWorkflowVideoModelId,
  WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT,
  workflowVideoElementInputHandleAffectsImageMentions,
  workflowVideoGeneratorAcceptsUpstreamVideo,
  workflowVideoModelHasEndFrame,
  workflowVideoModelHasStartFrame,
  workflowVideoOrderedElementImageRefs,
} from "./workflowNodeRun";
import { WorkflowMediaTrimDialog } from "./WorkflowMediaTrimDialog";

/** Matches `workflowNodeFactory` default for new Video Generator nodes (picker chaining eligibility). */
const DEFAULT_NEW_VIDEO_GENERATOR_MODEL = "kling-3.0/video";
const VIDEO_CHAIN_NEW_NODE_DEFAULT_MODEL = "bytedance/seedance-2-fast";

const nodeTypes = {
  adAsset: AdAssetNode,
  imageRef: ImageRefNode,
  workflowGroup: WorkflowGroupNode,
  stickyNote: StickyNoteNode,
  textPrompt: TextPromptNode,
  promptList: PromptListNode,
};

/** Vertically centered on the canvas; React Flow’s `center-left` adds a −15px Y offset meant for default margin, which misaligns when margin is 0. */
const WORKFLOW_LEFT_TOOLS_PANEL_STYLE: CSSProperties = {
  top: "50%",
  left: "1rem",
  transform: "translateY(-50%)",
  margin: 0,
};

type Tool = "select" | "pan" | "stickyPlace" | "cutTarget";

type WorkflowPlacementPickerState = {
  flow: XYPosition;
  screenX: number;
  screenY: number;
  /** When the user dropped a wire on empty canvas, new node links from this output. */
  connectFrom?: { nodeId: string; handleId: string | null };
  /** When the user clicked an input handle, new node links into this target input. */
  connectTo?: { nodeId: string; handleId: string };
  /** Optional preset to show context-aware creation choices. */
  intent?: "text-input" | "image-input" | "video-input" | "text-or-image" | "generic";
};

type WorkflowOpenInputPickerDetail = {
  targetNodeId: string;
  targetHandleId: "text" | "references" | "startImage" | "endImage" | "inVideo";
  screenX: number;
  screenY: number;
  forceIntent?: "text-or-image";
  usePointerFlow?: boolean;
};

type WorkflowOpenOutputPickerDetail = {
  sourceNodeId: string;
  sourceHandleId: string;
  screenX: number;
  screenY: number;
};

type WorkflowRunLogLevel = "info" | "error" | "success";

type WorkflowRunLogEntry = {
  ts: number;
  nodeId?: string;
  nodeLabel?: string;
  level: WorkflowRunLogLevel;
  message: string;
};

/** Scissors snip FX, Lucide scissors geometry; two halves close with a snap at the pivot. */
function WorkflowCutSnipFx({ x, y }: { x: number; y: number }) {
  const cap = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <div className="workflow-cut-fx-root" style={{ left: x, top: y }} aria-hidden>
      <svg className="workflow-cut-fx-svg" width="96" height="96" viewBox="0 0 24 24" aria-hidden>
        <g className="workflow-cut-fx-half-a">
          <circle cx="6" cy="6" r="3" fill="rgba(24,24,27,0.55)" stroke="#fafafa" strokeWidth="1.85" {...cap} />
          <path d="M8.12 8.12 12 12" fill="none" stroke="#e9d5ff" strokeWidth="2" {...cap} />
          <path d="M20 4 8.12 15.88" fill="none" stroke="#c4b5fd" strokeWidth="2" {...cap} />
        </g>
        <g className="workflow-cut-fx-half-b">
          <circle cx="6" cy="18" r="3" fill="rgba(24,24,27,0.55)" stroke="#fafafa" strokeWidth="1.85" {...cap} />
          <path d="M14.8 14.8 20 20" fill="none" stroke="#ddd6fe" strokeWidth="2" {...cap} />
        </g>
      </svg>
    </div>
  );
}

function getPointerClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("clientX" in event && typeof (event as MouseEvent).clientX === "number") {
    const e = event as MouseEvent;
    return { x: e.clientX, y: e.clientY };
  }
  const t = (event as TouchEvent).changedTouches?.[0];
  if (t) return { x: t.clientX, y: t.clientY };
  return null;
}

function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const onSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y);

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
  if (o1 === 0 && onSeg(a1, b1, a2)) return true;
  if (o2 === 0 && onSeg(a1, b2, a2)) return true;
  if (o3 === 0 && onSeg(b1, a1, b2)) return true;
  if (o4 === 0 && onSeg(b1, a2, b2)) return true;
  return false;
}

function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** Avoid firing canvas shortcuts while typing or inside modal dialogs (Radix overlays). */
function shouldIgnoreWorkflowCanvasShortcuts(): boolean {
  if (isEditableElementFocused()) return true;
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.closest('[role="dialog"]')) return true;
  return false;
}

const WORKFLOW_AD_ASSET_DRAG_KINDS: WorkflowDragNodeKind[] = [
  "image",
  "video",
  "motion",
  "variation",
  "assistant",
  "upscale",
  "website",
];

function isWorkflowAdAssetDragKind(raw: string): raw is WorkflowDragNodeKind {
  return WORKFLOW_AD_ASSET_DRAG_KINDS.includes(raw as WorkflowDragNodeKind);
}

function isRunnableWorkflowAdAssetKind(kind: AdAssetNodeData["kind"]): boolean {
  return kind === "image" || kind === "video" || kind === "motion" || kind === "assistant" || kind === "website";
}

type WorkflowConnectionDataKind = "text" | "image" | "video" | "media";

/** Narrow shape from `getInternalNode` for endpoint geometry (avoids `any`). */
type WorkflowRfInternalLayout = {
  internals?: {
    positionAbsolute?: XYPosition;
    handleBounds?: Partial<
      Record<
        "source" | "target",
        Array<{ id?: string | null; x: number; y: number; width: number; height: number }>
      >
    >;
  };
  measured?: { width?: number | null; height?: number | null };
  width?: number | null;
  height?: number | null;
  position?: XYPosition;
  positionAbsolute?: XYPosition;
};

function isProbablyImageUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (!u.startsWith("http")) return false;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) || u.includes("/image");
}

function isProbablyVideoUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (!u.startsWith("http")) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(u);
}

function inferPromptListKind(data: PromptListNodeData): WorkflowConnectionDataKind {
  if (data.contentKind === "media") {
    const lines = (data.lines ?? []).map((x) => x.trim()).filter(Boolean);
    const imageCount = lines.filter((u) => isProbablyImageUrl(u)).length;
    const videoCount = lines.filter((u) => isProbablyVideoUrl(u)).length;
    return videoCount > imageCount ? "video" : "image";
  }
  const lines = (data.lines ?? []).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return "text";
  const imageCount = lines.filter((u) => isProbablyImageUrl(u)).length;
  const videoCount = lines.filter((u) => isProbablyVideoUrl(u)).length;
  const imageMajority = imageCount >= Math.ceil(lines.length * 0.6);
  const videoMajority = videoCount >= Math.ceil(lines.length * 0.6);
  if (videoMajority && videoCount >= imageCount) return "video";
  if (imageMajority) return "image";
  return "text";
}

function sourceKindFromNodeHandle(
  node: WorkflowCanvasNode | undefined,
  handleId: string | null | undefined,
): WorkflowConnectionDataKind | null {
  if (!node) return null;
  const h = (handleId ?? "out").trim() || "out";
  if (node.type === "textPrompt" || node.type === "stickyNote") return "text";
  if (node.type === "imageRef") {
    const d = node.data as ImageRefNodeData;
    if (h === "videoFirst" || h === "videoLast") return "image";
    return d.mediaKind === "video" ? "video" : "image";
  }
  if (node.type === "promptList") {
    if (h === "outText") return "text";
    if (h === "outImage") return "image";
    if (h === "outVideo") return "video";
    return inferPromptListKind(node.data as PromptListNodeData);
  }
  if (node.type === "adAsset") {
    const d = node.data as AdAssetNodeData;
    if (h === "videoFirst" || h === "videoLast" || h === "generated") return "image";
    if (h !== "out") return null;
    if (d.kind === "assistant") return "text";
    if (d.kind === "video" || d.kind === "motion") return "video";
    if (d.kind === "image" || d.kind === "variation" || d.kind === "upscale") return "image";
    return null;
  }
  return null;
}

function isMarqueeModuleNode(node: WorkflowCanvasNode): boolean {
  return (
    node.type === "adAsset" ||
    node.type === "imageRef" ||
    node.type === "textPrompt" ||
    node.type === "promptList"
  );
}

function targetKindFromNodeHandle(
  node: WorkflowCanvasNode | undefined,
  handleId: string | null | undefined,
): WorkflowConnectionDataKind | null {
  if (!node) return null;
  const h = (handleId ?? "in").trim() || "in";
  if (h === "text" || h === "inText") return "text";
  if (h === "references" || h === "startImage" || h === "endImage" || h === "inImage") return "image";
  if (h === "inVideo") return "video";
  if (node.type === "imageRef" && h === "in") return "media";
  if (node.type === "promptList" && h === "in") return "text";
  return null;
}

function canConnectByDataKind(
  sourceKind: WorkflowConnectionDataKind | null,
  targetKind: WorkflowConnectionDataKind | null,
): boolean {
  if (!sourceKind || !targetKind) return true;
  if (sourceKind === "text") return targetKind === "text";
  if (sourceKind === "image") return targetKind === "image" || targetKind === "media";
  if (sourceKind === "video") return targetKind === "video" || targetKind === "media";
  if (sourceKind === "media") return targetKind === "media" || targetKind === "image" || targetKind === "video";
  return true;
}

function targetHandleForNewNodeFromSourceKind(
  newNode: WorkflowCanvasNode,
  sourceKind: WorkflowConnectionDataKind | null,
): string | null {
  if (!sourceKind) return null;
  if (newNode.type === "adAsset") {
    const d = newNode.data as AdAssetNodeData;
    const kind = d.kind;
    if (kind === "image" || kind === "variation" || kind === "upscale") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "references";
      return null;
    }
    if (kind === "video") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "startImage";
      if (sourceKind === "video") {
        const vm = resolveWorkflowVideoModelId(d.model ?? "");
        if (workflowVideoModelHasStartFrame(vm)) return "startImage";
        if (workflowVideoModelHasEndFrame(vm)) return "endImage";
        return null;
      }
      return null;
    }
    if (kind === "motion") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "startImage";
      if (sourceKind === "video") return "inVideo";
      return null;
    }
    if (kind === "assistant") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image")
        return d.assistantVisionPreset === "image_to_json" ? "references" : "startImage";
      if (sourceKind === "video") return d.assistantVisionPreset === "video_to_prompt" ? "inVideo" : null;
      return null;
    }
    if (kind === "website") {
      const profile360 = d.websiteOutputMode === "profile_360";
      if (profile360) {
        if (sourceKind === "image") return "references";
        return null;
      }
      if (sourceKind === "text") return "text";
      return null;
    }
    return null;
  }
  if (newNode.type === "promptList") {
    if (sourceKind === "text") return "inText";
    if (sourceKind === "image") return "inImage";
    if (sourceKind === "video") return "inVideo";
    return null;
  }
  if (newNode.type === "textPrompt") {
    return sourceKind === "text" ? "in" : null;
  }
  return null;
}

/** Full video clip (`out`) → Video Generator Start/End ports (runner extracts frames upstream). */
function workflowVideoChainsToGeneratorFramePorts(
  sourceNode: WorkflowCanvasNode | undefined,
  sourceHandle: string | null | undefined,
  targetNode: WorkflowCanvasNode | undefined,
  targetHandle: string | null | undefined,
): boolean {
  if (!sourceNode || !targetNode) return false;
  const srcKind = sourceKindFromNodeHandle(sourceNode, sourceHandle);
  if (srcKind !== "video") return false;
  if (targetNode.type !== "adAsset") return false;
  const d = targetNode.data as AdAssetNodeData;
  if (d.kind !== "video") return false;
  const h = (targetHandle ?? "").trim();
  const vm = resolveWorkflowVideoModelId(d.model ?? "");
  if (h === "startImage") return workflowVideoModelHasStartFrame(vm);
  if (h === "endImage") return workflowVideoModelHasEndFrame(vm);
  return false;
}

function workflowHandlesAllowConnect(
  sourceNode: WorkflowCanvasNode | undefined,
  sourceHandle: string | null | undefined,
  targetNode: WorkflowCanvasNode | undefined,
  targetHandle: string | null | undefined,
): boolean {
  const srcKind = sourceKindFromNodeHandle(sourceNode, sourceHandle);
  const dstKind = targetKindFromNodeHandle(targetNode, targetHandle);
  if (canConnectByDataKind(srcKind, dstKind)) return true;
  return workflowVideoChainsToGeneratorFramePorts(sourceNode, sourceHandle, targetNode, targetHandle);
}

function computeVideoGeneratorElementPromptAugmentation(opts: {
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  targetId: string;
  targetHandle: string | null | undefined;
}): { nodeId: string; prompt: string } | null {
  const { nodes, edges, targetId, targetHandle } = opts;
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!targetNode || targetNode.type !== "adAsset") return null;
  const d = targetNode.data as AdAssetNodeData;
  if (d.kind !== "video") return null;
  if (!workflowVideoElementInputHandleAffectsImageMentions(targetHandle, d.model ?? "")) return null;
  const ordered = workflowVideoOrderedElementImageRefs({
    modelPickerValue: d.model ?? "",
    nodes,
    edges,
    videoNodeId: targetId,
    data: d,
  });
  const need = ordered.length;
  if (need <= 0) return null;
  const nextPrompt = appendMissingWorkflowVideoElementImageTags(d.prompt ?? "", need);
  if (nextPrompt === (d.prompt ?? "")) return null;
  return { nodeId: targetId, prompt: nextPrompt };
}

function patchWorkflowVideoGeneratorPromptAfterConnect(
  setNodesFn: Dispatch<SetStateAction<WorkflowCanvasNode[]>>,
  patch: { nodeId: string; prompt: string } | null,
) {
  if (!patch) return;
  setNodesFn((prev) =>
    prev.map((n) =>
      n.id === patch.nodeId && n.type === "adAsset"
        ? { ...n, data: { ...(n.data as AdAssetNodeData), prompt: patch.prompt } }
        : n,
    ),
  );
}

function WorkflowAddPaletteRow({
  icon: Icon,
  label,
  iconShellClass,
  onClick,
  draggable,
  onDragStart,
  soon,
  isNew,
}: {
  icon: LucideIcon;
  label: string;
  iconShellClass: string;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  soon?: boolean;
  /** Small “New” pill next to the label (Basics palette). */
  isNew?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={!soon && Boolean(draggable)}
      onDragStart={soon ? undefined : onDragStart}
      onClick={onClick}
      disabled={soon}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left transition",
        soon ? "cursor-not-allowed opacity-45" : "hover:bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
          iconShellClass,
        )}
      >
        <Icon className="h-4 w-4 text-white" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/90">{label}</span>
      {isNew ? (
        <span className="shrink-0 rounded-full border border-violet-400/45 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">
          New
        </span>
      ) : null}
      {soon ? (
        <span className="ml-auto rounded-full border border-white/20 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
          Soon
        </span>
      ) : null}
    </button>
  );
}

const WORKFLOW_UNDO_DEBOUNCE_MS = 380;
const WORKFLOW_UNDO_MAX = 50;

type WorkflowCanvasSnapshot = { nodes: WorkflowCanvasNode[]; edges: Edge[] };

function cloneWorkflowCanvasSnapshot(nodes: WorkflowCanvasNode[], edges: Edge[]): WorkflowCanvasSnapshot {
  return { nodes: structuredClone(nodes), edges: structuredClone(edges) };
}

function workflowCanvasSnapshotsEqual(a: WorkflowCanvasSnapshot, b: WorkflowCanvasSnapshot): boolean {
  return JSON.stringify(a.nodes) === JSON.stringify(b.nodes) && JSON.stringify(a.edges) === JSON.stringify(b.edges);
}

/**
 * Avoid treating a delayed save as a real conflict when another save from this tab already landed on the server.
 * If payload already matches cloud, we only advance `updatedAt` and return.
 */
function workflowCloudPayloadMatchesLocal(
  cloud: { name?: string | null; publishedCommunityTemplateId?: string | null; state: WorkflowProjectStateV1 },
  local: { name: string; publishedCommunityTemplateId: string | null; state: WorkflowProjectStateV1 },
): boolean {
  const cloudName = (cloud.name ?? "").trim();
  const localName = (local.name ?? "").trim();
  const cloudTemplateId = (cloud.publishedCommunityTemplateId ?? "").trim();
  const localTemplateId = (local.publishedCommunityTemplateId ?? "").trim();
  return (
    cloudName === localName &&
    cloudTemplateId === localTemplateId &&
    JSON.stringify(cloud.state) === JSON.stringify(local.state)
  );
}

function ZoomLabel() {
  const zoom = useStore((s) => Math.round(s.transform[2] * 100));
  return <span className="tabular-nums">{zoom}%</span>;
}

type FlowWorkspaceProps = {
  project: WorkflowProjectStateV1;
  setProject: React.Dispatch<React.SetStateAction<WorkflowProjectStateV1>>;
  readOnly?: boolean;
  onRunLog?: (entry: WorkflowRunLogEntry) => void;
  /** When read-only template preview: bottom bar to duplicate into a workflow */
  showTemplateUseCta?: boolean;
  onUseTemplate?: () => void;
  useTemplateBusy?: boolean;
  /** Shared link preview (guest or not yet joined): duplicate / sign up */
  showSharePreviewCta?: boolean;
  sharePreviewDuplicateLabel?: string;
  onDuplicateSharePreview?: () => void;
  duplicateSharePreviewBusy?: boolean;
  sharePreviewJoinLabel?: string;
  onJoinShareWorkspace?: () => void;
  joinShareWorkspaceBusy?: boolean;
  /**
   * When set, registers a function that merges the live React Flow graph into the
   * project (active page). Used before publishing templates — parent `project` state
   * lags the canvas by ~200ms due to debounced sync.
   */
  canvasProjectFlushRef?: React.MutableRefObject<(() => WorkflowProjectStateV1) | null>;
  /**
   * Write-through persistence: invoked on every nodes/edges change with the merged
   * project snapshot, so the parent can write directly to localStorage without
   * waiting for the React state cycle / debounced sync. Critical for not losing
   * connections when the user reloads quickly after wiring nodes.
   */
  onCanvasPersist?: (snapshot: WorkflowProjectStateV1) => void;
};

function WorkflowPagesPanel({
  project,
  setProject,
  onSelectPage,
  onAddPage,
  nodesEdgesRef,
  readOnly,
}: {
  project: WorkflowProjectStateV1;
  setProject: React.Dispatch<React.SetStateAction<WorkflowProjectStateV1>>;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  nodesEdgesRef: React.MutableRefObject<{ nodes: WorkflowCanvasNode[]; edges: Edge[] } | null>;
  readOnly?: boolean;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function beginRename(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  function commitRename() {
    if (!renamingId) return;
    const id = renamingId;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    setProject((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  }

  function deletePage(id: string) {
    if (project.pages.length <= 1) return;
    const snap = nodesEdgesRef.current;
    setProject((prev) => {
      let pages = prev.pages.map((p) =>
        p.id === prev.activePageId && snap ? { ...p, nodes: snap.nodes, edges: snap.edges } : p,
      );
      pages = pages.filter((p) => p.id !== id);
      const nextActive = prev.activePageId === id ? pages[0].id : prev.activePageId;
      return { ...prev, pages, activePageId: nextActive };
    });
    if (renamingId === id) setRenamingId(null);
  }

  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 w-[min(100%,170px)] sm:left-3 sm:top-3">
      <div className="overflow-hidden rounded-lg border border-white/[0.1] bg-[#0b0912]/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-2 py-1.5">
          <span className="text-[11px] font-semibold text-white/90">Pages</span>
          {readOnly ? null : (
            <button
              type="button"
              onClick={onAddPage}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
            >
              + New
            </button>
          )}
        </div>
        <ul className="max-h-[min(28vh,170px)] space-y-1 overflow-y-auto p-1">
          {project.pages.map((p) => {
            const active = p.id === project.activePageId;
            return (
              <li key={p.id} className="group relative">
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="w-full rounded-md border border-violet-500/35 bg-black/40 px-2 py-1 text-center text-[11px] font-medium text-white outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectPage(p.id)}
                      onDoubleClick={readOnly ? undefined : () => beginRename(p.id, p.name)}
                      className={cn(
                        "min-w-0 flex-1 rounded-md px-2 py-1 text-center text-[11px] font-medium transition",
                        active
                          ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:bg-white/[0.05] hover:text-white/85",
                      )}
                    >
                      <span className="block truncate">{p.name}</span>
                    </button>
                    {!readOnly && project.pages.length > 1 ? (
                      <button
                        type="button"
                        title="Delete page"
                        onClick={() => deletePage(p.id)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/25 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Padding ratio — larger leaves more breathing room for a bird's-eye overview. */
const WORKFLOW_OPEN_FIT_PADDING = 0.38;

function FitViewOnPageChange({ activePageId }: { activePageId: string }) {
  const { fitView } = useReactFlow();
  const prevPageId = useRef<string | null>(null);
  useEffect(() => {
    const alreadyHandledSamePage =
      prevPageId.current !== null && prevPageId.current === activePageId;
    if (alreadyHandledSamePage) return;
    prevPageId.current = activePageId;

    const runFit = () => {
      try {
        void fitView({
          padding: WORKFLOW_OPEN_FIT_PADDING,
          duration: 420,
          interpolate: "smooth",
          minZoom: 0.05,
        });
      } catch {
        /* ignore */
      }
    };

    const t1 = window.setTimeout(() => {
      requestAnimationFrame(runFit);
    }, 160);
    const t2 = window.setTimeout(runFit, 520);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activePageId, fitView]);
  return null;
}

type ChromeProps = {
  tool: Tool;
  setTool: React.Dispatch<React.SetStateAction<Tool>>;
  addOpen: boolean;
  setAddOpen: (v: boolean | ((b: boolean) => boolean)) => void;
  setNodes: React.Dispatch<React.SetStateAction<WorkflowCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** Immediately persist a nodes/edges snapshot into the parent `project` state (avoids debounce loss on refresh). */
  commitProjectSnapshotNow: (nodes: WorkflowCanvasNode[], edges: Edge[]) => void;
  /** Patch a node's data on whichever page it lives on (cross-page-safe for async finalizers). */
  patchNodeDataAcrossPages: (
    nodeId: string,
    patch: Partial<
      AdAssetNodeData &
        WorkflowGroupNodeData &
        StickyNoteNodeData &
        TextPromptNodeData &
        PromptListNodeData &
        ImageRefNodeData
    >,
  ) => void;
  /** Remove a node and incident edges from any page (used to clean up failed-upload temp nodes). */
  removeNodeAcrossPages: (nodeId: string) => void;
  activePageId: string;
  activeName: string;
  selectedNodes: WorkflowCanvasNode[];
  frameOpen: boolean;
  setFrameOpen: (v: boolean | ((b: boolean) => boolean)) => void;
  selectionBarExpanded: boolean;
  setSelectionBarExpanded: (v: boolean | ((b: boolean) => boolean)) => void;
  onCloneSelection: () => void;
  onCopySelection: () => void;
  onDeleteSelection: () => void;
  canCut: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  uploadTrimState: {
    open: boolean;
    file: File;
    pendingConnect: { targetNodeId: string; targetHandleId: string; flow: XYPosition } | null;
  } | null;
  setUploadTrimState: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      file: File;
      pendingConnect: { targetNodeId: string; targetHandleId: string; flow: XYPosition } | null;
    } | null>
  >;
  readOnly?: boolean;
};

function WorkflowReactFlowChrome({
  tool,
  setTool,
  addOpen,
  setAddOpen,
  setNodes,
  setEdges,
  commitProjectSnapshotNow,
  patchNodeDataAcrossPages,
  removeNodeAcrossPages,
  activePageId,
  activeName,
  selectedNodes,
  frameOpen,
  setFrameOpen,
  selectionBarExpanded,
  setSelectionBarExpanded,
  onCloneSelection,
  onCopySelection,
  onDeleteSelection,
  canCut,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  uploadTrimState,
  setUploadTrimState,
  readOnly,
}: ChromeProps) {
  const pathname = usePathname();
  const barIcon = "h-[18px] w-[18px] shrink-0";
  const { screenToFlowPosition, flowToScreenPosition, getNodesBounds, getInternalNode, getNodes, getEdges } =
    useReactFlow();
  const viewport = useStore((s) => s.transform);

  const [groupColorDraft, setGroupColorDraft] = useState<string>(GROUP_COLOR_PRESETS[0].value);

  const eligibleForGroup = useMemo(
    () => selectedNodes.filter((n): n is WorkflowCanvasNode => n.type !== "workflowGroup" && !n.parentId),
    [selectedNodes],
  );
  const canGroup = eligibleForGroup.length >= 2;
  const canClone = useMemo(() => canCloneWorkflowSelection(selectedNodes), [selectedNodes]);

  const [layoutRev, setLayoutRev] = useState(0);
  useEffect(() => {
    const onResize = () => setLayoutRev((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const groupEligibleIdsKey = useMemo(
    () =>
      eligibleForGroup
        .map((n) => n.id)
        .sort()
        .join(","),
    [eligibleForGroup],
  );

  const eligiblePositionsSig = useStore((s) => {
    const ids = groupEligibleIdsKey.split(",").filter(Boolean);
    if (ids.length < 2) return "";
    let sig = "";
    for (const id of ids) {
      const n = s.nodeLookup.get(id);
      if (!n) continue;
      const p = n.internals.positionAbsolute ?? n.position;
      sig += `${p.x},${p.y};`;
    }
    return sig;
  });

  /** Screen position (center-x, top of selection) for floating "New group" + panel anchor. */
  const groupSelectionAnchor = useMemo(() => {
    if (!canGroup || eligibleForGroup.length < 2) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const VIEW_MARGIN = 8;
    const PANEL_HALF_W = 140;

    try {
      const current = getNodes() as WorkflowCanvasNode[];
      const fresh = eligibleForGroup.map((n) => current.find((x) => x.id === n.id) ?? n);
      const b = getNodesBounds(fresh);
      if (!Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;

      const cx = b.x + b.width / 2;
      const screenTop = flowToScreenPosition({ x: cx, y: b.y });
      const screenBottom = flowToScreenPosition({ x: cx, y: b.y + b.height });
      const left = Math.max(VIEW_MARGIN + PANEL_HALF_W, Math.min(vw - VIEW_MARGIN - PANEL_HALF_W, screenTop.x));

      return { left, screenTopY: screenTop.y, screenBottomY: screenBottom.y };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputes when layoutRev / viewport / eligible sigs change
  }, [
    canGroup,
    eligibleForGroup,
    eligiblePositionsSig,
    flowToScreenPosition,
    getNodes,
    getNodesBounds,
    groupEligibleIdsKey,
    layoutRev,
    viewport,
  ]);

  /**
   * Tight screen-space rectangle that visually wraps the currently selected
   * modules. Drawn after the user releases the marquee so it's clear which
   * modules are about to be grouped — and aligned with the floating
   * "New group" CTA above it.
   */
  const groupSelectionRect = useMemo(() => {
    if (!canGroup || eligibleForGroup.length < 2) return null;
    try {
      const current = getNodes() as WorkflowCanvasNode[];
      const fresh = eligibleForGroup.map((n) => current.find((x) => x.id === n.id) ?? n);
      const b = getNodesBounds(fresh);
      if (!Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
      const tl = flowToScreenPosition({ x: b.x, y: b.y });
      const br = flowToScreenPosition({ x: b.x + b.width, y: b.y + b.height });
      const PAD = 10;
      const left = Math.min(tl.x, br.x) - PAD;
      const top = Math.min(tl.y, br.y) - PAD;
      const width = Math.abs(br.x - tl.x) + PAD * 2;
      const height = Math.abs(br.y - tl.y) + PAD * 2;
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
      return { left, top, width, height };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputes when layoutRev / viewport / eligible sigs change
  }, [
    canGroup,
    eligibleForGroup,
    eligiblePositionsSig,
    flowToScreenPosition,
    getNodes,
    getNodesBounds,
    groupEligibleIdsKey,
    layoutRev,
    viewport,
  ]);

  const newGroupPanelScreen = useMemo(() => {
    if (!frameOpen || !groupSelectionAnchor) return null;
    const GAP = 12;
    const MIN_TOP_SAFE = 52;
    const ESTIMATED_PANEL_H = 172;
    const VIEW_MARGIN = 10;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    const { left, screenTopY, screenBottomY } = groupSelectionAnchor;
    const roomAbove = screenTopY - MIN_TOP_SAFE;
    const placeAbove = roomAbove >= Math.min(ESTIMATED_PANEL_H, 200) + GAP;

    const desiredTop = placeAbove ? screenTopY - GAP : screenBottomY + GAP;
    const transform = placeAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)";

    // Clamp so the dialog stays on-screen (users shouldn't have to pan/scroll to click "Create group").
    const maxTop = Math.max(MIN_TOP_SAFE, vh - VIEW_MARGIN - (placeAbove ? 0 : ESTIMATED_PANEL_H));
    const minTop = MIN_TOP_SAFE;
    const clampedTop = Math.max(minTop, Math.min(maxTop, desiredTop));

    return { left, top: clampedTop, transform };
  }, [frameOpen, groupSelectionAnchor]);

  useEffect(() => {
    if (!canGroup) {
      queueMicrotask(() => setSelectionBarExpanded(false));
    }
  }, [canGroup, setSelectionBarExpanded]);

  useEffect(() => {
    if (tool === "pan" || tool === "stickyPlace" || tool === "cutTarget") {
      queueMicrotask(() => setFrameOpen(false));
    }
  }, [tool, setFrameOpen]);

  const createGroup = useCallback((colorOverride?: string) => {
    if (!canGroup) {
      toast.error("Select at least two top-level nodes to group.");
      return;
    }
    const HEADER = 40;
    const PAD = 24;
    const current = getNodes() as WorkflowCanvasNode[];
    const freshEligible = eligibleForGroup.map((n) => current.find((x) => x.id === n.id) ?? n);
    const bounds = getNodesBounds(freshEligible);
    const gx = bounds.x - PAD;
    const gy = bounds.y - PAD - HEADER;
    const gw = Math.max(bounds.width + 2 * PAD, 200);
    const gh = Math.max(bounds.height + 2 * PAD + HEADER, 160);
    const groupId = crypto.randomUUID();
    const name = "Group";
    const color = colorOverride && /^#[0-9A-Fa-f]{6}$/.test(colorOverride) ? colorOverride : groupColorDraft;

    const childUpdates = freshEligible.map((n) => {
      const internal = getInternalNode(n.id);
      const abs = internal?.internals.positionAbsolute ?? { x: n.position.x, y: n.position.y };
      return { node: n, abs };
    });

    setNodes((prev) => {
      const selectedIds = new Set(freshEligible.map((n) => n.id));
      const rest = prev.filter((n) => !selectedIds.has(n.id));
      const groupNode: WorkflowGroupNodeType = {
        id: groupId,
        type: "workflowGroup",
        position: { x: gx, y: gy },
        style: { width: gw, height: gh },
        data: { label: name, color },
        zIndex: -1,
      };
      const updatedChildren = childUpdates.map(({ node: n, abs }) => ({
        ...n,
        parentId: groupId,
        extent: "parent" as const,
        position: { x: abs.x - gx, y: abs.y - gy },
        selected: false,
      }));
      return [...rest, groupNode, ...updatedChildren].map((n) =>
        n.id === groupId ? { ...n, selected: true } : n,
      );
    });
    setFrameOpen(false);
    setSelectionBarExpanded(false);
    toast.success("Group created");
  }, [
    canGroup,
    eligibleForGroup,
    getInternalNode,
    getNodes,
    getNodesBounds,
    groupColorDraft,
    setFrameOpen,
    setSelectionBarExpanded,
    setNodes,
  ]);

  const addNode = useCallback(
    (kind: WorkflowDragNodeKind) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      setNodes((prev) => [...prev, buildAdAssetNode(kind, position)]);
      setAddOpen(false);
      setFrameOpen(false);
    },
    [screenToFlowPosition, setNodes, setAddOpen, setFrameOpen],
  );

  const addStickyNote = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    setNodes((prev) => [...prev, buildStickyNoteNode(position)]);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("Note added");
  }, [screenToFlowPosition, setNodes, setAddOpen, setFrameOpen]);

  const addTextPromptNode = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    setNodes((prev) => [...prev, buildTextPromptNode(position)]);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("Prompt text added");
  }, [screenToFlowPosition, setNodes, setAddOpen, setFrameOpen]);

  const addPromptListNode = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    setNodes((prev) => [...prev, buildPromptListNode(position)]);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("List added");
  }, [screenToFlowPosition, setNodes, setAddOpen, setFrameOpen]);

  const addWorkflow360ProfileBranch = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const built = buildWorkflow360ProfileBranch(position);
    const nodesSnap = getNodes() as WorkflowCanvasNode[];
    const edgesSnap = getEdges();
    const nextNodes = [...nodesSnap, ...built.nodes];
    const nextEdges = [...edgesSnap, ...built.edges];
    setNodes((prev) => [...prev, ...built.nodes]);
    setEdges((prev) => [...prev, ...built.edges]);
    commitProjectSnapshotNow(nextNodes, nextEdges);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("360° profile generator added — wire your own image reference.");
  }, [commitProjectSnapshotNow, getEdges, getNodes, screenToFlowPosition, setNodes, setEdges, setAddOpen, setFrameOpen]);

  const addWorkflowImageToJsonBranch = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const built = buildWorkflowImageToJsonBranch(position);
    const nodesSnap = getNodes() as WorkflowCanvasNode[];
    const edgesSnap = getEdges();
    const nextNodes = [...nodesSnap, ...built.nodes];
    const nextEdges = [...edgesSnap, ...built.edges];
    setNodes((prev) => [...prev, ...built.nodes]);
    setEdges((prev) => [...prev, ...built.edges]);
    commitProjectSnapshotNow(nextNodes, nextEdges);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("Image → JSON assistant added — connect an HTTPS image.");
  }, [commitProjectSnapshotNow, getEdges, getNodes, screenToFlowPosition, setNodes, setEdges, setAddOpen, setFrameOpen]);

  const addWorkflowVideoToPromptBranch = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const built = buildWorkflowVideoToPromptBranch(position);
    const nodesSnap = getNodes() as WorkflowCanvasNode[];
    const edgesSnap = getEdges();
    const nextNodes = [...nodesSnap, ...built.nodes];
    const nextEdges = [...edgesSnap, ...built.edges];
    setNodes((prev) => [...prev, ...built.nodes]);
    setEdges((prev) => [...prev, ...built.edges]);
    commitProjectSnapshotNow(nextNodes, nextEdges);
    setAddOpen(false);
    setFrameOpen(false);
    toast.success("Video → Prompt assistant added — connect a video and run.");
  }, [commitProjectSnapshotNow, getEdges, getNodes, screenToFlowPosition, setNodes, setEdges, setAddOpen, setFrameOpen]);

  const [addPlusTab, setAddPlusTab] = useState<"basics" | "upload">("basics");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<"feedback" | "feature" | "bug">("feedback");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackImageUploading, setFeedbackImageUploading] = useState(false);
  const [feedbackImageUrl, setFeedbackImageUrl] = useState<string | null>(null);
  const [feedbackImagePreviewUrl, setFeedbackImagePreviewUrl] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const feedbackImageInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = useCallback(async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      toast.error("Please add your message.");
      return;
    }
    if (feedbackImageUploading) {
      toast.error("Please wait for the image upload to finish.");
      return;
    }
    setFeedbackSending(true);
    try {
      const fullMessage = feedbackImageUrl
        ? `${message}\n\nAttachment: ${feedbackImageUrl}`
        : message;
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: feedbackCategory,
          message: fullMessage,
          pagePath: pathname || "/workflow",
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setFeedbackMessage("");
      setFeedbackCategory("feedback");
      setFeedbackImageUrl(null);
      setFeedbackImagePreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prev);
          } catch {}
        }
        return null;
      });
      setFeedbackOpen(false);
      toast.success("Feedback sent. Thank you!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send feedback.");
    } finally {
      setFeedbackSending(false);
    }
  }, [feedbackCategory, feedbackImageUploading, feedbackImageUrl, feedbackMessage, pathname]);

  useEffect(() => {
    if (!feedbackOpen) {
      setFeedbackImageUrl(null);
      setFeedbackImagePreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prev);
          } catch {}
        }
        return null;
      });
      setFeedbackImageUploading(false);
    }
  }, [feedbackOpen]);
  useEffect(() => {
    const onOpen = (
      ev: Event,
    ) => {
      const detail = (ev as CustomEvent<{
        pendingConnect?: { targetNodeId: string; targetHandleId: string; flow: XYPosition };
        fileAccept?: string;
      }>).detail;
      pendingImageRefConnectRef.current = detail?.pendingConnect ?? null;
      setPendingImageRefConnect(detail?.pendingConnect ?? null);
      const inp = uploadInputRef.current;
      if (inp) {
        const acc = detail?.fileAccept?.trim();
        if (acc) {
          inp.accept = acc;
          inp.multiple = false;
        } else {
          inp.accept = "image/*,video/*";
          inp.multiple = true;
        }
        inp.click();
      }
    };
    window.addEventListener("workflow:open-upload-picker", onOpen as EventListener);
    return () => window.removeEventListener("workflow:open-upload-picker", onOpen as EventListener);
  }, []);
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        pendingConnect?: { targetNodeId: string; targetHandleId: string; flow: XYPosition };
      }>).detail;
      pendingImageRefConnectRef.current = detail?.pendingConnect ?? null;
      setPendingImageRefConnect(detail?.pendingConnect ?? null);
      setAvatarPickerOpen(true);
    };
    window.addEventListener("workflow:open-avatar-picker", onOpen as EventListener);
    return () => window.removeEventListener("workflow:open-avatar-picker", onOpen as EventListener);
  }, []);
  const [, setPendingImageRefConnect] = useState<{
    targetNodeId: string;
    targetHandleId: string;
    flow: XYPosition;
  } | null>(null);
  const pendingImageRefConnectRef = useRef<{
    targetNodeId: string;
    targetHandleId: string;
    flow: XYPosition;
  } | null>(null);
  const updatePendingImageRefConnect = useCallback(
    (
      next: {
        targetNodeId: string;
        targetHandleId: string;
        flow: XYPosition;
      } | null,
    ) => {
      pendingImageRefConnectRef.current = next;
      setPendingImageRefConnect(next);
    },
    [],
  );

  useEffect(() => {
    if (!avatarPickerOpen) return;
    void loadAvatarUrls().then((urls) => setAvatarUrls(urls));
  }, [avatarPickerOpen]);

  const addImageNodeFromFile = useCallback(
    (file: File) => {
      const pendingConnect = pendingImageRefConnectRef.current;
      const isVideo = isVideoFile(file);
      const objectUrl = URL.createObjectURL(file);
      let tempNodeId: string | null = null;
      void (async () => {
        try {
          if (isVideo) {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.src = objectUrl;
            const duration = await new Promise<number>((resolve, reject) => {
              v.onloadedmetadata = () => resolve(Number(v.duration || 0));
              v.onerror = () => reject(new Error("Could not read video duration."));
            });
            if (Number.isFinite(duration) && duration > 15.01) {
              URL.revokeObjectURL(objectUrl);
              setUploadTrimState({
                open: true,
                file,
                pendingConnect,
              });
              return;
            }
          }
          const ar = isVideo
            ? await measureVideoAspectFromObjectUrl(objectUrl)
            : await measureImageAspectFromObjectUrl(objectUrl);
          const position = screenToFlowPosition({
            x: pendingConnect != null ? pendingConnect.flow.x : window.innerWidth / 2,
            y: pendingConnect != null ? pendingConnect.flow.y : window.innerHeight / 2,
          });
          const baseName = file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Video" : "Image");
          const tempNode = buildImageRefNode(position, {
            imageUrl: objectUrl,
            source: "upload",
            mediaKind: isVideo ? "video" : "image",
            intrinsicAspect: ar,
            label: `${baseName} (uploading...)`,
          });
          tempNodeId = tempNode.id;
          const nodesSnapForPrompt = [...(getNodes() as WorkflowCanvasNode[]), tempNode];
          setNodes((prev) => [...prev, tempNode]);
          if (pendingConnect) {
            setEdges((eds) => {
              const next = addEdge(
                {
                  id: `e-${tempNode.id}-${pendingConnect.targetNodeId}-${crypto.randomUUID().slice(0, 8)}`,
                  source: tempNode.id,
                  sourceHandle: "out",
                  target: pendingConnect.targetNodeId,
                  targetHandle: pendingConnect.targetHandleId,
                  style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
                },
                eds,
              );
              patchWorkflowVideoGeneratorPromptAfterConnect(
                setNodes,
                computeVideoGeneratorElementPromptAugmentation({
                  nodes: nodesSnapForPrompt,
                  edges: next,
                  targetId: pendingConnect.targetNodeId,
                  targetHandle: pendingConnect.targetHandleId,
                }),
              );
              return next;
            });
            updatePendingImageRefConnect(null);
          }
          setAddOpen(false);
          setFrameOpen(false);

          const hostedUrl = await uploadFileToCdn(file, { kind: isVideo ? "video" : "image" });
          // Cross-page-safe finalize: works even if the user navigated to another page during upload.
          patchNodeDataAcrossPages(tempNode.id, {
            imageUrl: hostedUrl,
            label: baseName,
            source: "upload",
            mediaKind: isVideo ? "video" : "image",
            intrinsicAspect: ar,
          });
          toast.success("Node added");
          URL.revokeObjectURL(objectUrl);
        } catch {
          updatePendingImageRefConnect(null);
          if (tempNodeId) {
            removeNodeAcrossPages(tempNodeId);
          }
          URL.revokeObjectURL(objectUrl);
          toast.error("Could not read file", { description: "Try another image or video." });
        }
      })();
    },
    [
      screenToFlowPosition,
      getNodes,
      setEdges,
      setNodes,
      setAddOpen,
      setFrameOpen,
      updatePendingImageRefConnect,
      patchNodeDataAcrossPages,
      removeNodeAcrossPages,
    ],
  );

  const onUploadFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      const inp = uploadInputRef.current;
      if (inp) {
        inp.accept = "image/*,video/*";
        inp.multiple = true;
      }
      if (!files.length) {
        updatePendingImageRefConnect(null);
        return;
      }
      for (const file of files) {
        addImageNodeFromFile(file);
      }
    },
    [addImageNodeFromFile, updatePendingImageRefConnect],
  );

  const onAvatarPicked = useCallback(
    (url: string) => {
      void (async () => {
        const pendingConnect = pendingImageRefConnectRef.current;
        const ar = await measureImageAspectFromUrlSafe(url);
        const position = screenToFlowPosition({
          x: pendingConnect != null ? pendingConnect.flow.x : window.innerWidth / 2,
          y: pendingConnect != null ? pendingConnect.flow.y : window.innerHeight / 2,
        });
        const nextNode = buildImageRefNode(position, {
          imageUrl: url,
          source: "avatar",
          mediaKind: "image",
          intrinsicAspect: ar,
          label: "Avatar",
        });
        const nodesSnapForPrompt = [...(getNodes() as WorkflowCanvasNode[]), nextNode];
        setNodes((prev) => [...prev, nextNode]);
        if (pendingConnect) {
          setEdges((eds) => {
            const next = addEdge(
              {
                id: `e-${nextNode.id}-${pendingConnect.targetNodeId}-${crypto.randomUUID().slice(0, 8)}`,
                source: nextNode.id,
                sourceHandle: "out",
                target: pendingConnect.targetNodeId,
                targetHandle: pendingConnect.targetHandleId,
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              },
              eds,
            );
            patchWorkflowVideoGeneratorPromptAfterConnect(
              setNodes,
              computeVideoGeneratorElementPromptAugmentation({
                nodes: nodesSnapForPrompt,
                edges: next,
                targetId: pendingConnect.targetNodeId,
                targetHandle: pendingConnect.targetHandleId,
              }),
            );
            return next;
          });
          updatePendingImageRefConnect(null);
        }
        setAddOpen(false);
        setFrameOpen(false);
        toast.success("Node added");
      })();
    },
    [screenToFlowPosition, getNodes, setEdges, setNodes, setAddOpen, setFrameOpen, updatePendingImageRefConnect],
  );

  const setDragPayload = useCallback((e: DragEvent, payload: string) => {
    e.dataTransfer.setData(WORKFLOW_NODE_DND, payload);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (shouldIgnoreWorkflowCanvasShortcuts()) return;

      if (e.key === "Escape") {
        if (feedbackOpen || avatarPickerOpen) return;
        if (addOpen) {
          e.preventDefault();
          setAddOpen(false);
          return;
        }
        if (frameOpen) {
          e.preventDefault();
          setFrameOpen(false);
          return;
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAddOpen((was) => {
          const next = !was;
          if (next) setAddPlusTab("basics");
          return next;
        });
        setFrameOpen(false);
        return;
      }

      if (mod || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === "v") {
        e.preventDefault();
        setTool("select");
        setAddOpen(false);
        setFrameOpen(false);
        return;
      }
      if (k === "h") {
        e.preventDefault();
        setTool("pan");
        setAddOpen(false);
        setFrameOpen(false);
        return;
      }
      if (k === "e") {
        e.preventDefault();
        setAddOpen(false);
        setFrameOpen(false);
        setTool((t) => (t === "cutTarget" ? "pan" : "cutTarget"));
        return;
      }
      if (k === "n") {
        e.preventDefault();
        setAddOpen(false);
        setFrameOpen(false);
        setTool((t) => (t === "stickyPlace" ? "pan" : "stickyPlace"));
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    readOnly,
    addOpen,
    frameOpen,
    feedbackOpen,
    avatarPickerOpen,
    setTool,
    setAddOpen,
    setFrameOpen,
    setAddPlusTab,
  ]);

  if (readOnly) {
    return (
      <>
        <FitViewOnPageChange activePageId={activePageId} />
        <Background
          id="workflow-dots-base"
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.15}
          color="rgba(167, 139, 250, 0.09)"
        />
        <Background
          id="workflow-dots-glow"
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.15}
          color="rgba(228, 222, 255, 0.42)"
          className="workflow-flow-dot-glow"
        />
        <Panel
          position="top-left"
          className="z-10 flex !w-auto"
          style={WORKFLOW_LEFT_TOOLS_PANEL_STYLE}
        >
          <div
            role="toolbar"
            aria-label="View-only canvas"
            className="flex w-11 flex-col items-center rounded-full border border-white/[0.09] bg-[#0b0912]/95 py-2.5 pl-1 pr-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
              title="Pan the canvas (view only)"
            >
              <Hand className={barIcon} strokeWidth={2} />
            </div>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <FitViewOnPageChange activePageId={activePageId} />
      <Background
        id="workflow-dots-base"
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.15}
        color="rgba(167, 139, 250, 0.09)"
      />
      <Background
        id="workflow-dots-glow"
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.15}
        color="rgba(228, 222, 255, 0.42)"
        className="workflow-flow-dot-glow"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onUploadFileChange}
      />

      <Panel
        position="top-left"
        className="z-40 flex !w-auto"
        style={WORKFLOW_LEFT_TOOLS_PANEL_STYLE}
      >
        <div
          role="toolbar"
          aria-label="Canvas tools"
          className="flex w-11 flex-col items-center gap-1 rounded-full border border-white/[0.09] bg-[#0b0912]/95 py-2.5 pl-1 pr-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
        >
          <div className="relative flex w-full flex-col items-center">
            <button
              type="button"
              title="Add node (Ctrl+Shift+A)"
              onClick={() => {
                setAddOpen((was) => {
                  const next = !was;
                  if (next) setAddPlusTab("basics");
                  return next;
                });
                setFrameOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]"
            >
              <Plus className={barIcon} strokeWidth={2.25} />
            </button>
            {addOpen ? (
              <div className="absolute left-[calc(100%+10px)] top-0 z-[260] w-[min(100vw-20px,300px)] overflow-hidden rounded-xl border border-white/10 bg-[#0b0912] shadow-xl">
                <div className="flex border-b border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setAddPlusTab("basics")}
                    className={cn(
                      "min-w-0 flex-1 py-2.5 text-[11px] font-semibold transition sm:text-[12px]",
                      addPlusTab === "basics"
                        ? "border-b-2 border-violet-400 text-white"
                        : "text-white/45 hover:text-white/70",
                    )}
                  >
                    Basics
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPlusTab("upload")}
                    className={cn(
                      "min-w-0 flex-1 py-2.5 text-[11px] font-semibold transition sm:text-[12px]",
                      addPlusTab === "upload"
                        ? "border-b-2 border-violet-400 text-white"
                        : "text-white/45 hover:text-white/70",
                    )}
                  >
                    Upload
                  </button>
                </div>
                <div className="max-h-[min(70vh,440px)] overflow-y-auto">
                {addPlusTab === "basics" ? (
                  <div className="py-1">
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      Basics
                    </p>
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "pick");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      className="flex cursor-grab items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[12px] text-white/60 active:cursor-grabbing"
                      title="Drop on the canvas to choose node type"
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-white/35" aria-hidden />
                      <span>Drag to canvas, pick type on drop</span>
                    </div>
                    <WorkflowAddPaletteRow
                      icon={Type}
                      label="Prompt text"
                      iconShellClass="border-emerald-500/45 bg-emerald-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "textPrompt");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addTextPromptNode()}
                    />
                    <WorkflowAddPaletteRow
                      icon={ListOrdered}
                      label="List"
                      iconShellClass="border-fuchsia-500/45 bg-fuchsia-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "promptList");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addPromptListNode()}
                    />
                    <WorkflowAddPaletteRow
                      icon={MessageSquare}
                      label="Canvas note"
                      iconShellClass="border-amber-500/40 bg-amber-950/70"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "sticky");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addStickyNote()}
                    />
                    <WorkflowAddPaletteRow
                      icon={ImageIconLucide}
                      label="Image Generator"
                      iconShellClass="border-violet-500/45 bg-violet-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "image");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("image")}
                    />
                    <WorkflowAddPaletteRow
                      icon={Clapperboard}
                      label="Video Generator"
                      iconShellClass="border-violet-500/45 bg-violet-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "video");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("video")}
                    />
                    <WorkflowAddPaletteRow
                      icon={Clapperboard}
                      label="Motion Control"
                      iconShellClass="border-violet-500/45 bg-violet-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "motion");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("motion")}
                    />
                    <WorkflowAddPaletteRow
                      icon={Globe2}
                      label="Website"
                      iconShellClass="border-cyan-500/45 bg-cyan-950/80"
                      soon
                      onClick={() => addNode("website")}
                    />
                    <WorkflowAddPaletteRow
                      icon={RotateCw}
                      label="360° profile (image → image)"
                      iconShellClass="border-violet-500/45 bg-violet-950/80"
                      isNew
                      onClick={() => addWorkflow360ProfileBranch()}
                    />
                    <WorkflowAddPaletteRow
                      icon={Braces}
                      label="Image → JSON (structured text)"
                      iconShellClass="border-emerald-500/45 bg-emerald-950/80"
                      isNew
                      onClick={() => addWorkflowImageToJsonBranch()}
                    />
                    <WorkflowAddPaletteRow
                      icon={Clapperboard}
                      label="Video → Prompt (recreate)"
                      iconShellClass="border-emerald-500/45 bg-emerald-950/80"
                      isNew
                      onClick={() => addWorkflowVideoToPromptBranch()}
                    />
                    <WorkflowAddPaletteRow
                      icon={Sparkles}
                      label="Assistant"
                      iconShellClass="border-emerald-400/40 bg-emerald-950/75"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "assistant");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("assistant")}
                    />
                    <WorkflowAddPaletteRow
                      icon={ImageUpscale}
                      label="Image Upscaler"
                      iconShellClass="border-violet-400/45 bg-violet-950/75"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "upscale");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("upscale")}
                    />
                    <WorkflowAddPaletteRow
                      icon={UserRound}
                      label="Avatar"
                      iconShellClass="border-sky-500/45 bg-sky-950/80"
                      onClick={() => {
                        setAvatarPickerOpen(true);
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                    />
                  </div>
                ) : addPlusTab === "upload" ? (
                  <div className="space-y-3 p-3">
                    <p className="text-[12px] leading-snug text-white/55">
                      Upload an image or video as a reference node. Connect it to a generator to use as input.
                    </p>
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] py-2.5 text-[13px] font-semibold text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/10"
                    >
                      <Upload className="h-4 w-4 text-white/70" strokeWidth={2} aria-hidden />
                      Browse files
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="my-0.5 h-px w-7 bg-white/[0.12]" aria-hidden />

          <button
            type="button"
            title="Select (V) — drag on empty canvas to box-select; Ctrl/Cmd+click to add to selection"
            onClick={() => setTool("select")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              tool === "select"
                ? "bg-white text-zinc-900 shadow-sm hover:bg-white"
                : "text-white/90 hover:bg-white/[0.08]",
            )}
          >
            <MousePointer2 className={barIcon} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            title="Pan (H)"
            onClick={() => setTool("pan")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              tool === "pan" ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/[0.08]",
            )}
          >
            <Hand className={barIcon} strokeWidth={2} />
          </button>

          <div className="my-0.5 h-px w-7 bg-white/[0.12]" aria-hidden />

          <button
            type="button"
            title={
              readOnly
                ? "Cut tool (view only)"
                : tool === "cutTarget"
                  ? "Cut tool active (E)"
                  : "Cut tool (E)"
            }
            disabled={readOnly}
            onClick={() => {
              if (readOnly) return;
              setAddOpen(false);
              setFrameOpen(false);
              setTool(tool === "cutTarget" ? "pan" : "cutTarget");
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              readOnly && "cursor-not-allowed text-white/35 opacity-90",
              !readOnly && tool === "cutTarget"
                ? "bg-white text-zinc-900 shadow-sm hover:bg-white"
                : !readOnly && "text-white/90 hover:bg-white/[0.08]",
            )}
          >
            <Scissors className={barIcon} strokeWidth={2} />
          </button>
          <div className="relative flex w-full flex-col items-center">
            <button
              type="button"
              title={
                canGroup
                  ? "Group selection, name and color"
                  : "Select tool: drag on the canvas to box-select two or more nodes, then set name and color"
              }
              disabled={!canGroup}
              onClick={() => {
                if (!canGroup) return;
                setFrameOpen((o) => !o);
                setAddOpen(false);
              }}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                canGroup
                  ? "text-white/90 hover:bg-white/[0.08]"
                  : "cursor-not-allowed text-white/35 opacity-90",
              )}
            >
              <SquareStack className={barIcon} strokeWidth={2} />
              <ChevronDown
                className="pointer-events-none absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-white/55"
                strokeWidth={3}
                aria-hidden
              />
            </button>
          </div>
          <button
            type="button"
            title={
              canClone
                ? "Duplicate selection (Ctrl+D)"
                : "Select a group, generator, prompt text, upload node, or canvas note to duplicate (Ctrl+D)"
            }
            disabled={!canClone}
            onClick={() => {
              if (!canClone) return;
              setAddOpen(false);
              setFrameOpen(false);
              if (tool === "cutTarget") setTool("pan");
              onCloneSelection();
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              canClone ? "text-white/90 hover:bg-white/[0.08]" : "cursor-not-allowed text-white/35 opacity-90",
            )}
          >
            <Copy className={barIcon} strokeWidth={2} />
          </button>
          <button
            type="button"
            title={
              tool === "stickyPlace"
                ? "Canvas note tool (N), click to place (Esc to cancel)"
                : "Canvas note (N), click the canvas to place a note"
            }
            onClick={() => {
              setTool(tool === "stickyPlace" ? "pan" : "stickyPlace");
              setAddOpen(false);
              setFrameOpen(false);
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              tool === "stickyPlace"
                ? "bg-white text-zinc-900 shadow-sm hover:bg-white"
                : "text-white/90 hover:bg-white/[0.08]",
            )}
          >
            <MessageSquare className={barIcon} strokeWidth={2} />
          </button>

          <div className="my-0.5 h-px w-7 bg-white/[0.12]" aria-hidden />

          <button
            type="button"
            title="Undo, Ctrl+Z"
            disabled={!canUndo}
            onClick={() => {
              if (!canUndo) return;
              onUndo();
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              canUndo ? "text-white/90 hover:bg-white/[0.08]" : "cursor-not-allowed text-white/35 opacity-90",
            )}
          >
            <Undo2 className={barIcon} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Redo, Ctrl+Y or Ctrl+Shift+Z"
            disabled={!canRedo}
            onClick={() => {
              if (!canRedo) return;
              onRedo();
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              canRedo ? "text-white/90 hover:bg-white/[0.08]" : "cursor-not-allowed text-white/30 opacity-90",
            )}
          >
            <Redo2 className={barIcon} strokeWidth={2} />
          </button>
        </div>
      </Panel>

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={(open) => {
          setAvatarPickerOpen(open);
          if (!open) updatePendingImageRefConnect(null);
        }}
        avatarUrls={avatarUrls}
        onPick={onAvatarPicked}
        title="Choose avatar"
      />

      <Panel position="bottom-center" className="!m-0 !mb-4 flex !flex-col !items-center gap-2 !w-auto">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#0b0912]/95 px-4 py-2 text-[13px] font-semibold text-white shadow-lg backdrop-blur-md transition hover:border-white/20 hover:bg-[#0b0912]"
        >
          <Layers className="h-4 w-4 text-white/70" aria-hidden />
          {activeName}
        </button>
        <div className="flex items-center gap-3 rounded-full border border-violet-500/25 bg-[#06070d]/95 px-4 py-2 text-[12px] text-white/50 shadow-lg backdrop-blur-md">
          <button
            type="button"
            className="text-white/40 hover:text-white/65"
            onClick={() => setFeedbackOpen(true)}
          >
            Give feedback
          </button>
          <span className="text-white/25">|</span>
          <button type="button" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
            <ZoomLabel />
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>
      </Panel>

      {feedbackOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0912] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Send feedback</p>
                <p className="mt-1 text-xs text-white/45">
                  Share a bug, feature request, or any idea. It will be visible in Admin &gt; Feedback.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/70 hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[11px] text-white/45">Type</span>
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory((e.target.value as "feedback" | "feature" | "bug") ?? "feedback")}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/40"
                >
                  <option value="feedback">Feedback</option>
                  <option value="feature">Feature request</option>
                  <option value="bug">Bug report</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-white/45">Message</span>
                <textarea
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Describe your idea or issue…"
                  rows={7}
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-500/40"
                />
              </label>
              <div className="grid gap-1">
                <span className="text-[11px] text-white/45">Image (optional)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={feedbackImageInputRef}
                    type="file"
                    accept={STUDIO_IMAGE_FILE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void (async () => {
                        if (feedbackImageUploading) return;
                        setFeedbackImageUploading(true);
                        const objectUrl = URL.createObjectURL(file);
                        setFeedbackImagePreviewUrl((prev) => {
                          if (prev?.startsWith("blob:")) {
                            try {
                              URL.revokeObjectURL(prev);
                            } catch {}
                          }
                          return objectUrl;
                        });
                        try {
                          const compressed = await compressImageFileForUpload(file);
                          const hosted = await uploadFileToCdn(compressed, { kind: "image" });
                          setFeedbackImageUrl(hosted);
                          toast.success("Image attached.");
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Upload failed.";
                          toast.error(msg);
                          setFeedbackImageUrl(null);
                          setFeedbackImagePreviewUrl((prev) => {
                            if (prev?.startsWith("blob:")) {
                              try {
                                URL.revokeObjectURL(prev);
                              } catch {}
                            }
                            return null;
                          });
                        } finally {
                          setFeedbackImageUploading(false);
                        }
                      })();
                    }}
                  />
                  <button
                    type="button"
                    disabled={feedbackImageUploading}
                    onClick={() => feedbackImageInputRef.current?.click()}
                    className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {feedbackImageUploading ? "Uploading..." : feedbackImageUrl ? "Replace image" : "Upload image"}
                  </button>
                  {feedbackImagePreviewUrl ? (
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={feedbackImagePreviewUrl}
                        alt="Feedback attachment"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                  {feedbackImageUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFeedbackImageUrl(null);
                        setFeedbackImagePreviewUrl((prev) => {
                          if (prev?.startsWith("blob:")) {
                            try {
                              URL.revokeObjectURL(prev);
                            } catch {}
                          }
                          return null;
                        });
                      }}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:bg-white/[0.08]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-white/35">
                  This helps us understand your bug/feature faster.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/65 hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitFeedback()}
                disabled={feedbackSending || feedbackImageUploading}
                className="inline-flex items-center rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {feedbackSending ? "Sending..." : "Send feedback"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {uploadTrimState?.open && uploadTrimState.file ? (
        <WorkflowMediaTrimDialog
          open={true}
          file={uploadTrimState.file}
          kind="video"
          maxDurationSec={15}
          title="Trim video to 15s"
          onOpenChange={(open) => {
            if (open) return;
            setUploadTrimState(null);
          }}
          onTrimmed={(trimmed) => {
            const saved = uploadTrimState.pendingConnect;
            setUploadTrimState(null);
            if (saved?.targetNodeId && saved.targetHandleId) {
              pendingImageRefConnectRef.current = saved;
              addImageNodeFromFile(trimmed);
              return;
            }
            // Drop-to-canvas trim flow: place the node at the stored flow coordinates.
            const flow = saved?.flow;
            if (!flow) return;
            const file = trimmed;
            const objectUrl = URL.createObjectURL(file);
            void (async () => {
              try {
                const isVideo = isVideoFile(file);
                const ar = isVideo
                  ? await measureVideoAspectFromObjectUrl(objectUrl)
                  : await measureImageAspectFromObjectUrl(objectUrl);
                const baseName = file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Video" : "Image");
                const tempNode = buildImageRefNode(flow, {
                  imageUrl: objectUrl,
                  source: "upload",
                  mediaKind: isVideo ? "video" : "image",
                  intrinsicAspect: ar,
                  label: `${baseName} (uploading...)`,
                });
                setNodes((prev) => [...prev, tempNode]);
                const hostedUrl = await uploadFileToCdn(file, { kind: isVideo ? "video" : "image" });
                patchNodeDataAcrossPages(tempNode.id, {
                  imageUrl: hostedUrl,
                  label: baseName,
                  source: "upload",
                  mediaKind: isVideo ? "video" : "image",
                  intrinsicAspect: ar,
                });
                URL.revokeObjectURL(objectUrl);
                toast.success("Node added");
              } catch {
                URL.revokeObjectURL(objectUrl);
                toast.error("Could not read file", { description: "Try another image or video." });
              }
            })();
          }}
        />
      ) : null}

      {/**
       * Visual outline of the currently marquee-selected modules. Helps the
       * user understand exactly what would be grouped when they click the
       * floating "New group" CTA above. Pointer-events:none so it never
       * intercepts clicks on the underlying nodes.
       */}
      {!readOnly && canGroup && !frameOpen && groupSelectionRect ? (
        <div
          className="pointer-events-none fixed z-[195]"
          style={{
            left: groupSelectionRect.left,
            top: groupSelectionRect.top,
            width: groupSelectionRect.width,
            height: groupSelectionRect.height,
          }}
          aria-hidden
        >
          <div
            className="h-full w-full rounded-2xl border border-dashed border-violet-300/55 bg-violet-400/[0.04] shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_18px_48px_rgba(76,29,149,0.18)]"
          />
        </div>
      ) : null}

      {!readOnly && canGroup && !frameOpen && groupSelectionAnchor ? (
        <div
          className="pointer-events-auto fixed z-[199]"
          style={{
            left: groupSelectionAnchor.left,
            top: groupSelectionAnchor.screenTopY - 8,
            transform: "translate(-50%, -100%)",
          }}
          role="toolbar"
          aria-label="Multi-selection actions"
        >
          {selectionBarExpanded ? (
            <div className="flex max-w-[calc(100vw-24px)] items-center gap-0.5 rounded-full border border-white/14 bg-[#121212]/95 py-1 pl-1 pr-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  title="Group name and color"
                  onClick={() => {
                    setFrameOpen(true);
                    setAddOpen(false);
                  }}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-l-lg rounded-r-none py-1 pl-2.5 pr-1.5 text-white/90 transition hover:bg-white/[0.08]"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-white/25 shadow-inner"
                    style={{
                      backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(groupColorDraft)
                        ? groupColorDraft
                        : GROUP_COLOR_PRESETS[0].value,
                    }}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  title="Open group options"
                  onClick={() => {
                    setFrameOpen(true);
                    setAddOpen(false);
                  }}
                  className="flex h-8 w-7 shrink-0 items-center justify-center rounded-r-lg rounded-l-none text-white/90 transition hover:bg-white/[0.08]"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-white/65" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
              <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />
              <button
                type="button"
                title="Align selection"
                onClick={() =>
                  toast.message("Coming soon", { description: "Alignment tools will be available here." })
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08]"
              >
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Shapes"
                onClick={() =>
                  toast.message("Coming soon", { description: "Shape presets will be available here." })
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08]"
              >
                <Shapes className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Lock"
                onClick={() =>
                  toast.message("Coming soon", { description: "Locking nodes will be available here." })
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08]"
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />
              <button
                type="button"
                title={
                  canClone
                    ? "Duplicate selection (Ctrl+D)"
                    : "Select a group, generator, prompt text module, upload, or canvas note to duplicate (Ctrl+D)"
                }
                disabled={!canClone}
                onClick={() => {
                  if (!canClone) return;
                  setAddOpen(false);
                  setFrameOpen(false);
                  if (tool === "cutTarget") setTool("pan");
                  onCloneSelection();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <CopyPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Remove selection (Delete or Backspace)"
                disabled={!canCut}
                onClick={() => {
                  if (!canCut) return;
                  setAddOpen(false);
                  setFrameOpen(false);
                  onDeleteSelection();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title={
                  readOnly
                    ? "Cut tool (view only)"
                    : tool === "cutTarget"
                      ? "Cut tool active (E)"
                      : "Cut tool (E)"
                }
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  setAddOpen(false);
                  setFrameOpen(false);
                  setSelectionBarExpanded(false);
                  setTool(tool === "cutTarget" ? "pan" : "cutTarget");
                }}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35",
                  readOnly && "text-white/90",
                  !readOnly && tool === "cutTarget" && "bg-white text-zinc-900 hover:bg-white",
                  !readOnly && tool !== "cutTarget" && "text-white/90",
                )}
              >
                <Scissors className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title={canCut ? "Copy selection (Ctrl+C)" : "Nothing to copy in this selection"}
                disabled={!canCut}
                onClick={() => {
                  if (!canCut) return;
                  onCopySelection();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  title="Copy options"
                  onClick={() =>
                    toast.message("Coming soon", { description: "Extra copy and paste options will live here." })
                  }
                  className="flex h-8 w-7 items-center justify-center rounded-l-lg rounded-r-none text-white/90 transition hover:bg-white/[0.08]"
                >
                  <Layers className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  title="Layer options"
                  onClick={() =>
                    toast.message("Coming soon", { description: "Layer options will be available here." })
                  }
                  className="flex h-8 w-7 items-center justify-center rounded-r-lg rounded-l-none text-white/90 transition hover:bg-white/[0.08]"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-white/65" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
              <button
                type="button"
                title="More"
                onClick={() =>
                  toast.message("Coming soon", { description: "More selection actions will be available here." })
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 rounded-full border border-white/14 bg-[#121212]/95 py-1 pl-1 pr-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
              {canClone ? (
                <button
                  type="button"
                  title="Duplicate selection (Ctrl+D)"
                  onClick={() => {
                    setAddOpen(false);
                    setFrameOpen(false);
                    if (tool === "cutTarget") setTool("pan");
                    onCloneSelection();
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08]"
                >
                  <CopyPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                title="More actions — group, align, cut, copy…"
                onClick={() => {
                  setSelectionBarExpanded(true);
                  setAddOpen(false);
                }}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-violet-300/90 transition hover:bg-white/[0.08] hover:text-violet-200",
                  canClone && "border-l border-white/[0.12] pl-0.5",
                )}
              >
                <SquareStack className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </button>
            </div>
          )}
        </div>
      ) : null}

      {frameOpen && canGroup ? (
        <div
          role="dialog"
          aria-label="New group"
          className="pointer-events-auto fixed z-[200] w-[min(100vw-24px,220px)] rounded-xl border border-white/10 bg-[#0b0912] p-2.5 shadow-2xl"
          style={
            newGroupPanelScreen ?? {
              left: "50%",
              top: 96,
              transform: "translateX(-50%)",
            }
          }
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Group color</p>
            <button
              type="button"
              onClick={() => setFrameOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/35 transition hover:bg-white/[0.06] hover:text-white/70"
              aria-label="Close"
              title="Close"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-white/45">
            Pick a color to create instantly.
          </p>
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {GROUP_COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  className={cn(
                    "h-6 w-6 rounded-full border border-white/15 transition hover:scale-105",
                    groupColorDraft === c.value && "ring-2 ring-white/50 ring-offset-2 ring-offset-[#0b0912]",
                  )}
                  style={{ backgroundColor: c.value }}
                  onClick={() => {
                    setGroupColorDraft(c.value);
                    createGroup(c.value);
                  }}
                />
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/55 hover:border-white/20">
              <span className="whitespace-nowrap">Custom</span>
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(groupColorDraft) ? groupColorDraft : GROUP_COLOR_PRESETS[0].value}
                onChange={(e) => {
                  const v = e.target.value;
                  setGroupColorDraft(v);
                  createGroup(v);
                }}
                className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Custom color"
              />
            </label>
          </div>
        </div>
      ) : null}
    </>
  );
}

function WorkflowFlowWorkspace({
  project,
  setProject,
  readOnly = false,
  onRunLog,
  showTemplateUseCta = false,
  onUseTemplate,
  useTemplateBusy = false,
  showSharePreviewCta = false,
  sharePreviewDuplicateLabel = "Duplicate",
  onDuplicateSharePreview,
  duplicateSharePreviewBusy = false,
  sharePreviewJoinLabel,
  onJoinShareWorkspace,
  joinShareWorkspaceBusy = false,
  canvasProjectFlushRef,
  onCanvasPersist,
}: FlowWorkspaceProps) {
  const { screenToFlowPosition, flowToScreenPosition, getInternalNode, getNodes, getEdges, getViewport } =
    useReactFlow();
  const activePage = useMemo(
    () => project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0],
    [project.pages, project.activePageId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>(activePage?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(activePage?.edges ?? []);
  const [alignGuides, setAlignGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const alignHoldCandidateRef = useRef<{ nodeId: string; guideX: number | null; guideY: number | null; sinceMs: number } | null>(null);
  const lastAlignTargetRef = useRef<{ nodeId: string; x: number | null; y: number | null } | null>(null);
  /** Timestamp of last onNodeDrag alignment pass — throttled to ~60 fps. */
  const lastDragAlignAtRef = useRef(0);
  const [tool, setTool] = useState<Tool>("pan");
  const [addOpen, setAddOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [selectionBarExpanded, setSelectionBarExpanded] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredEdgeScissors, setHoveredEdgeScissors] = useState<{ x: number; y: number } | null>(null);
  const edgeHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEdgePointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Derive from node `selected` flags, matches React Flow's controlled state (onSelectionChange can lag). */
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: WorkflowCanvasNode[]; edges: Edge[] }) => {
      if (readOnly || tool !== "select") return;
      // Apply strict "touched modules only" behavior on marquee multi-select.
      // Single-click selection remains unchanged (notes/groups still editable).
      if ((selNodes?.length ?? 0) <= 1) return;
      const keepIds = new Set(selNodes.filter((n) => isMarqueeModuleNode(n)).map((n) => n.id));
      setNodes((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          const shouldSelect = keepIds.has(n.id);
          if ((n.selected ?? false) !== shouldSelect) {
            changed = true;
            return { ...n, selected: shouldSelect };
          }
          return n;
        });
        return changed ? next : prev;
      });
      // Avoid edge selection noise when box-selecting modules.
      setEdges((prev) => {
        let changed = false;
        const next = prev.map((e) => {
          if (!e.selected) return e;
          changed = true;
          return { ...e, selected: false };
        });
        return changed ? next : prev;
      });
    },
    [readOnly, tool, setNodes, setEdges],
  );
  const [placementPicker, setPlacementPicker] = useState<WorkflowPlacementPickerState | null>(null);
  const placementRef = useRef<HTMLDivElement>(null);
  const [uploadTrimState, setUploadTrimState] = useState<{
    open: boolean;
    file: File;
    pendingConnect: { targetNodeId: string; targetHandleId: string; flow: XYPosition } | null;
  } | null>(null);
  const cutTargetBusyRef = useRef(false);
  const cutSuppressNextPaneClickRef = useRef(false);
  /** After a wire drop that opens the placement menu, ignore the synthetic pane click that would clear it. */
  const suppressWorkflowPaneClickRef = useRef(false);
  /** XY Flow can omit `fromNode` on `onConnectEnd`; keep the handle we started from. */
  const connectInteractionOriginRef = useRef<{ nodeId: string; handleId: string | null } | null>(null);
  const cutSnipClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cutSnipFx, setCutSnipFx] = useState<{ x: number; y: number } | null>(null);
  const [cutTrailPoints, setCutTrailPoints] = useState<{ x: number; y: number }[]>([]);
  const cutTrailActiveRef = useRef(false);
  const cutTrailJustFinishedRef = useRef(false);
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  /** Fallback when ⌘/Ctrl+D fires but React Flow has not updated `node.selected` yet. */
  const lastClickedWorkflowNodeIdRef = useRef<string | null>(null);
  const [runFromHereParamLock, setRunFromHereParamLock] = useState(false);
  const runFromHereLockToastAtRef = useRef(0);

  /** Opening the placement menu after a wire drop often triggers a synthetic pane `click` that would clear it immediately. */
  const armPlacementPickerAgainstPaneClick = useCallback(() => {
    suppressWorkflowPaneClickRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (suppressWorkflowPaneClickRef.current) {
          suppressWorkflowPaneClickRef.current = false;
        }
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (cutSnipClearTimerRef.current) {
        clearTimeout(cutSnipClearTimerRef.current);
        cutSnipClearTimerRef.current = null;
      }
    };
  }, []);

  const nodesEdgesRef = useRef<{ nodes: WorkflowCanvasNode[]; edges: Edge[] } | null>(null);
  nodesEdgesRef.current = { nodes, edges };

  const undoStackRef = useRef<WorkflowCanvasSnapshot[]>([]);
  const redoStackRef = useRef<WorkflowCanvasSnapshot[]>([]);
  const lastSnapshotRef = useRef<WorkflowCanvasSnapshot | null>(null);
  const skipHistoryCommitRef = useRef(false);
  /**
   * Page-switch guard: when `activePageId` changes, React Flow still holds the previous page's
   * nodes/edges for one render tick. Without this guard, write-back effects can overwrite the
   * newly selected page with stale graph data (manifesting as lost/disconnected links).
   * We skip both sync effects once during that transition.
   */
  const skipCanvasSyncPassesRef = useRef(0);
  const [historyUiTick, setHistoryUiTick] = useState(0);
  const bumpHistoryUi = useCallback(() => setHistoryUiTick((n) => n + 1), []);

  useLayoutEffect(() => {
    const p = project.pages.find((x) => x.id === project.activePageId);
    if (p) lastSnapshotRef.current = cloneWorkflowCanvasSnapshot(p.nodes, p.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed undo baseline once on mount only
  }, []);

  const prevActiveId = useRef(project.activePageId);

  const commitProjectSnapshotNow = useCallback(
    (nextNodes: WorkflowCanvasNode[], nextEdges: Edge[]) => {
      const id = project.activePageId;
      // Keep the flush ref snapshot in sync immediately (avoids losing placement on rapid refresh/navigation).
      nodesEdgesRef.current = { nodes: nextNodes, edges: nextEdges };
      const snapshot = {
        ...project,
        pages: project.pages.map((p) => (p.id === id ? { ...p, nodes: nextNodes, edges: nextEdges } : p)),
      };
      setProject((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.id === id ? { ...p, nodes: nextNodes, edges: nextEdges } : p)),
      }));
      // Hard write-through: persist synchronously on critical actions (connect/drag-stop/add-node).
      // This removes the remaining race where a tab reload lands between state update and debounced effects.
      try {
        onCanvasPersist?.(snapshot);
      } catch {
        /* best-effort write-through */
      }
    },
    [project, setProject, onCanvasPersist],
  );

  /**
   * Patch a node's `data` regardless of which page it currently lives on.
   *
   * Why: async tasks (CDN uploads, generation polling, frame extraction) often
   * resolve AFTER the user has navigated to a different workflow page. A plain
   * `setNodes((nds) => nds.map(...))` only sees the active page's React Flow
   * state, so the target node is missing and the patch is silently dropped —
   * leading to "lost" output URLs on upload nodes / image generator nodes when
   * switching pages mid-run. This helper writes through `setProject` (which
   * has every page) AND to React Flow live state when applicable.
   */
  const patchNodeDataAcrossPages = useCallback(
    (
      nodeId: string,
      patch: Partial<
        AdAssetNodeData &
          WorkflowGroupNodeData &
          StickyNoteNodeData &
          TextPromptNodeData &
          PromptListNodeData &
          ImageRefNodeData
      >,
    ) => {
      if (!nodeId || !patch || Object.keys(patch).length === 0) return;
      setProject((prev) => {
        let touched = false;
        const nextPages = prev.pages.map((p) => {
          const idx = p.nodes.findIndex((n) => n.id === nodeId);
          if (idx === -1) return p;
          touched = true;
          const nextNodes = p.nodes.map((n, i) =>
            i === idx ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowCanvasNode) : n,
          );
          return { ...p, nodes: nextNodes };
        });
        if (!touched) return prev;
        return { ...prev, pages: nextPages };
      });
      setNodes((nds) => {
        if (!nds.some((n) => n.id === nodeId)) return nds;
        return nds.map((n) =>
          n.id === nodeId
            ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowCanvasNode)
            : n,
        );
      });
    },
    [setProject, setNodes],
  );

  // Stable ref to project so callbacks can read the latest value without
  // having to list `project` (or `project.pages`) as a dependency, which
  // would cause all context consumers to re-render on every node change.
  const projectRef = useRef(project);
  projectRef.current = project;

  /**
   * Remove a node and any incident edges, regardless of which page it lives on.
   * Used when an async upload fails and we need to clean up a temp node that
   * may now belong to a non-active page.
   */
  const removeNodeAcrossPages = useCallback(
    (nodeId: string) => {
      if (!nodeId) return;
      setProject((prev) => {
        let touched = false;
        const nextPages = prev.pages.map((p) => {
          const hasNode = p.nodes.some((n) => n.id === nodeId);
          const hasEdge = p.edges.some((e) => e.source === nodeId || e.target === nodeId);
          if (!hasNode && !hasEdge) return p;
          touched = true;
          return {
            ...p,
            nodes: p.nodes.filter((n) => n.id !== nodeId),
            edges: p.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          };
        });
        if (!touched) return prev;
        return { ...prev, pages: nextPages };
      });
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setProject, setNodes, setEdges],
  );

  useEffect(() => {
    if (prevActiveId.current === project.activePageId) return;
    prevActiveId.current = project.activePageId;
    const p = project.pages.find((x) => x.id === project.activePageId);
    if (p) {
      // Skip both "setProject from nodes/edges" and write-through persist effects once.
      // They run before React Flow has applied the new page canvas state.
      skipCanvasSyncPassesRef.current = 2;
      skipHistoryCommitRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      lastSnapshotRef.current = cloneWorkflowCanvasSnapshot(p.nodes, p.edges);
      setNodes(p.nodes.map((n) => ({ ...n, selected: false })));
      setEdges(migrateImageGeneratorOutEdgesToGenerated(p.nodes as WorkflowCanvasNode[], p.edges));
      setFrameOpen(false);
      setPlacementPicker(null);
      setTool("pan");
      bumpHistoryUi();
    }
  }, [project.activePageId, project.pages, setNodes, setEdges, bumpHistoryUi, setTool]);

  useEffect(() => {
    if (readOnly) return;
    if (skipHistoryCommitRef.current) {
      skipHistoryCommitRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      const snap = cloneWorkflowCanvasSnapshot(nodes, edges);
      const prev = lastSnapshotRef.current;
      if (prev && workflowCanvasSnapshotsEqual(snap, prev)) return;
      if (prev) {
        undoStackRef.current.push(prev);
        if (undoStackRef.current.length > WORKFLOW_UNDO_MAX) undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      lastSnapshotRef.current = snap;
      bumpHistoryUi();
    }, WORKFLOW_UNDO_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [nodes, edges, readOnly, bumpHistoryUi]);

  const applyCanvasSnapshot = useCallback((snap: WorkflowCanvasSnapshot) => {
    skipHistoryCommitRef.current = true;
    const migrated = migrateImageGeneratorOutEdgesToGenerated(snap.nodes as WorkflowCanvasNode[], snap.edges);
    lastSnapshotRef.current = cloneWorkflowCanvasSnapshot(snap.nodes, migrated);
    setNodes(snap.nodes);
    setEdges(migrated);
    bumpHistoryUi();
  }, [setNodes, setEdges, bumpHistoryUi]);

  const onUndo = useCallback(() => {
    if (readOnly) return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    const cur = lastSnapshotRef.current;
    if (cur) redoStackRef.current.push(cur);
    applyCanvasSnapshot(prev);
  }, [readOnly, applyCanvasSnapshot]);

  const onRedo = useCallback(() => {
    if (readOnly) return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack.pop()!;
    const cur = lastSnapshotRef.current;
    if (cur) undoStackRef.current.push(cur);
    applyCanvasSnapshot(next);
  }, [readOnly, applyCanvasSnapshot]);

  void historyUiTick;
  const canUndo = !readOnly && undoStackRef.current.length > 0;
  const canRedo = !readOnly && redoStackRef.current.length > 0;

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setAddOpen(false);
      setFrameOpen(false);

      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) {
        void (async () => {
          let added = 0;
          let offset = 0;
          for (const file of files) {
            const isVideo = isVideoFile(file);
            const isImage = file.type.startsWith("image/");
            if (!isVideo && !isImage) continue;
            const pos = { x: flowPos.x + offset, y: flowPos.y + offset * 0.65 };
            offset += 28;
            const objectUrl = URL.createObjectURL(file);
            try {
              if (isVideo) {
                const v = document.createElement("video");
                v.preload = "metadata";
                v.src = objectUrl;
                const duration = await new Promise<number>((resolve, reject) => {
                  v.onloadedmetadata = () => resolve(Number(v.duration || 0));
                  v.onerror = () => reject(new Error("Could not read video duration."));
                });
                if (Number.isFinite(duration) && duration > 15.01) {
                  URL.revokeObjectURL(objectUrl);
                  setUploadTrimState({
                    open: true,
                    file,
                    pendingConnect: { targetNodeId: "", targetHandleId: "", flow: pos },
                  });
                  return;
                }
              }
              const ar = isVideo
                ? await measureVideoAspectFromObjectUrl(objectUrl)
                : await measureImageAspectFromObjectUrl(objectUrl);
              const baseName = file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Video" : "Image");
              const tempNode = buildImageRefNode(pos, {
                imageUrl: objectUrl,
                source: "upload",
                mediaKind: isVideo ? "video" : "image",
                intrinsicAspect: ar,
                label: `${baseName} (uploading...)`,
              });
              setNodes((prev) => [...prev, tempNode]);
              const hostedUrl = await uploadFileToCdn(file, { kind: isVideo ? "video" : "image" });
              patchNodeDataAcrossPages(tempNode.id, {
                imageUrl: hostedUrl,
                label: baseName,
                source: "upload",
                mediaKind: isVideo ? "video" : "image",
                intrinsicAspect: ar,
              });
              URL.revokeObjectURL(objectUrl);
              added += 1;
            } catch {
              URL.revokeObjectURL(objectUrl);
            }
          }
          if (added > 0) toast.success(added === 1 ? "Node added" : `${added} nodes added`);
          else toast.error("No supported file dropped", { description: "Drop an image or a video file." });
        })();
        return;
      }

      const raw = e.dataTransfer.getData(WORKFLOW_NODE_DND);
      if (!raw) return;
      if (raw === "pick") {
        setPlacementPicker({ flow: flowPos, screenX: e.clientX, screenY: e.clientY });
        return;
      }
      if (raw === "sticky") {
        setNodes((prev) => [...prev, buildStickyNoteNode(flowPos)]);
        toast.success("Node added");
        return;
      }
      if (raw === "textPrompt") {
        setNodes((prev) => [...prev, buildTextPromptNode(flowPos)]);
        toast.success("Node added");
        return;
      }
      if (raw === "promptList") {
        setNodes((prev) => [...prev, buildPromptListNode(flowPos)]);
        toast.success("Node added");
        return;
      }
      if (isWorkflowAdAssetDragKind(raw)) {
        setNodes((prev) => [...prev, buildAdAssetNode(raw, flowPos)]);
        toast.success("Node added");
        return;
      }
    },
    [readOnly, screenToFlowPosition, setNodes, setUploadTrimState, patchNodeDataAcrossPages],
  );

  useEffect(() => {
    if (!placementPicker) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setPlacementPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placementPicker]);

  useEffect(() => {
    const onOpenInputPicker = (ev: Event) => {
      const detail = (ev as CustomEvent<WorkflowOpenInputPickerDetail>).detail;
      if (!detail) return;
      const target = nodes.find((n) => n.id === detail.targetNodeId);
      const yOffsets: Record<WorkflowOpenInputPickerDetail["targetHandleId"], number> = {
        text: -100,
        startImage: -67,
        endImage: -33,
        inVideo: -40,
        references: 0,
      };
      const fallbackFlow = screenToFlowPosition({ x: detail.screenX, y: detail.screenY });
      const leftFlow =
        target && !detail.usePointerFlow
          ? { x: target.position.x - 250, y: target.position.y + yOffsets[detail.targetHandleId] }
          : fallbackFlow;
      armPlacementPickerAgainstPaneClick();
      setPlacementPicker({
        flow: leftFlow,
        screenX: detail.screenX,
        screenY: detail.screenY,
        connectTo: { nodeId: detail.targetNodeId, handleId: detail.targetHandleId },
        intent:
          detail.forceIntent ??
          (detail.targetHandleId === "text"
            ? "text-input"
            : detail.targetHandleId === "inVideo"
              ? "video-input"
              : "image-input"),
      });
    };
    window.addEventListener("workflow:open-input-picker", onOpenInputPicker as EventListener);
    return () =>
      window.removeEventListener("workflow:open-input-picker", onOpenInputPicker as EventListener);
  }, [nodes, screenToFlowPosition, armPlacementPickerAgainstPaneClick]);

  useEffect(() => {
    const onOpenOutputPicker = (ev: Event) => {
      const detail = (ev as CustomEvent<WorkflowOpenOutputPickerDetail>).detail;
      if (!detail) return;
      const sourceNode = nodes.find((n) => n.id === detail.sourceNodeId);
      const sourceKind = sourceKindFromNodeHandle(sourceNode, detail.sourceHandleId);
      if (!sourceKind) return;
      const fallbackFlow = screenToFlowPosition({ x: detail.screenX, y: detail.screenY });
      const rightFlow = sourceNode
        ? { x: sourceNode.position.x + 300, y: sourceNode.position.y + 8 }
        : fallbackFlow;
      armPlacementPickerAgainstPaneClick();
      setPlacementPicker({
        flow: rightFlow,
        screenX: detail.screenX,
        screenY: detail.screenY,
        connectFrom: { nodeId: detail.sourceNodeId, handleId: detail.sourceHandleId },
      });
    };
    window.addEventListener("workflow:open-output-picker", onOpenOutputPicker as EventListener);
    return () =>
      window.removeEventListener("workflow:open-output-picker", onOpenOutputPicker as EventListener);
  }, [nodes, screenToFlowPosition, armPlacementPickerAgainstPaneClick]);

  useEffect(() => {
    if (readOnly) return;

    const onDrop = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        targetNodeId: string;
        targetHandleId: WorkflowOpenInputPickerDetail["targetHandleId"];
        screenX: number;
        screenY: number;
      }>).detail;
      if (!detail) return;

      const targetHandleId = detail.targetHandleId;
      const targetNodeId = detail.targetNodeId;
      const flow = screenToFlowPosition({ x: detail.screenX, y: detail.screenY });

      armPlacementPickerAgainstPaneClick();
      setPlacementPicker({
        flow,
        screenX: detail.screenX,
        screenY: detail.screenY,
        connectTo: { nodeId: targetNodeId, handleId: targetHandleId },
        intent:
          targetHandleId === "text"
            ? "text-input"
            : targetHandleId === "inVideo"
              ? "video-input"
              : "image-input",
      });
    };

    window.addEventListener("workflow:input-bubble-drop", onDrop as EventListener);
    return () => {
      window.removeEventListener("workflow:input-bubble-drop", onDrop as EventListener);
    };
  }, [readOnly, screenToFlowPosition, armPlacementPickerAgainstPaneClick]);

  useEffect(() => {
    if (!onRunLog) return;
    const onWorkflowRunLog = (ev: Event) => {
      const detail = (ev as CustomEvent<WorkflowRunLogEntry>).detail;
      if (!detail || typeof detail.message !== "string" || !detail.message.trim()) return;
      const level: WorkflowRunLogLevel =
        detail.level === "error" ? "error" : detail.level === "success" ? "success" : "info";
      onRunLog({
        ts: typeof detail.ts === "number" ? detail.ts : Date.now(),
        nodeId: typeof detail.nodeId === "string" ? detail.nodeId : undefined,
        nodeLabel: typeof detail.nodeLabel === "string" ? detail.nodeLabel : undefined,
        level,
        message: detail.message.trim(),
      });
    };
    window.addEventListener("workflow:run-log", onWorkflowRunLog as EventListener);
    return () => window.removeEventListener("workflow:run-log", onWorkflowRunLog as EventListener);
  }, [onRunLog]);

  useEffect(() => {
    if (readOnly) return;

    const onDrop = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        sourceNodeId: string;
        sourceHandleId: string;
        screenX: number;
        screenY: number;
      }>).detail;
      if (!detail) return;
      armPlacementPickerAgainstPaneClick();
      setPlacementPicker({
        flow: screenToFlowPosition({ x: detail.screenX, y: detail.screenY }),
        screenX: detail.screenX,
        screenY: detail.screenY,
        connectFrom: { nodeId: detail.sourceNodeId, handleId: detail.sourceHandleId },
      });
    };

    window.addEventListener("workflow:output-bubble-drop", onDrop as EventListener);
    return () => {
      window.removeEventListener("workflow:output-bubble-drop", onDrop as EventListener);
    };
  }, [readOnly, screenToFlowPosition, armPlacementPickerAgainstPaneClick]);

  useEffect(() => {
    if (!placementPicker) return;
    const onDown = (ev: MouseEvent) => {
      const el = placementRef.current;
      if (el && ev.target instanceof Node && el.contains(ev.target)) return;
      setPlacementPicker(null);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [placementPicker]);

  const placeNodeAtPicker = useCallback(
    (kind: WorkflowDragNodeKind | "sticky" | "textPrompt" | "promptList", options?: BuildAdAssetNodeOptions) => {
      if (!placementPicker) return;
      const newNode =
        kind === "sticky"
          ? buildStickyNoteNode(placementPicker.flow)
          : kind === "textPrompt"
            ? buildTextPromptNode(placementPicker.flow)
            : kind === "promptList"
              ? buildPromptListNode(placementPicker.flow)
            : buildAdAssetNode(kind, placementPicker.flow, options);
      const from = placementPicker.connectFrom;
      const to = placementPicker.connectTo;
      setNodes((prev) => [...prev, newNode]);
      const connectableFrom =
        newNode.type === "adAsset" ||
        newNode.type === "textPrompt" ||
        newNode.type === "promptList";
      const connectableTo =
        newNode.type === "adAsset" || newNode.type === "textPrompt" || newNode.type === "promptList";
      if (from && connectableFrom) {
        const allNodes = getNodes() as WorkflowCanvasNode[];
        // React Flow store can lag briefly during rapid interactions; fallback to React state snapshot.
        const fromNode =
          allNodes.find((n) => n.id === from.nodeId) ?? (nodes as WorkflowCanvasNode[]).find((n) => n.id === from.nodeId);
        const resolvedFromHandle = (() => {
          const explicit = (from.handleId ?? "").trim();
          if (explicit) return explicit;
          if (!fromNode) return "out";
          if (fromNode.type === "imageRef") return "out";
          if (fromNode.type === "textPrompt" || fromNode.type === "stickyNote") return "out";
          if (fromNode.type === "promptList") return "outText";
          if (fromNode.type === "adAsset") {
            const d = fromNode.data as AdAssetNodeData;
            if (d.kind === "image" || d.kind === "variation" || d.kind === "upscale") return "generated";
            return "out";
          }
          return "out";
        })();
        const fromKind = sourceKindFromNodeHandle(fromNode, resolvedFromHandle);
        const defaultTargetHandle = targetHandleForNewNodeFromSourceKind(newNode as WorkflowCanvasNode, fromKind);
        if (!defaultTargetHandle) {
          toast.error("Incompatible connection", {
            description: "This output type can only connect to matching input bubbles.",
          });
          setPlacementPicker(null);
          return;
        }
        const nodesSnapFrom = [...allNodes, newNode];
        setEdges((eds) => {
          const next = addEdge(
            {
              id: `e-${from.nodeId}-${newNode.id}-${crypto.randomUUID().slice(0, 8)}`,
              source: from.nodeId,
              sourceHandle: resolvedFromHandle,
              target: newNode.id,
              targetHandle: defaultTargetHandle,
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
            eds,
          );
          patchWorkflowVideoGeneratorPromptAfterConnect(
            setNodes,
            computeVideoGeneratorElementPromptAugmentation({
              nodes: nodesSnapFrom,
              edges: next,
              targetId: newNode.id,
              targetHandle: defaultTargetHandle,
            }),
          );
          return next;
        });
      }
      if (to && connectableTo) {
        const newAd = newNode.type === "adAsset" ? (newNode.data as AdAssetNodeData) : null;
        let outHandle = newAd?.kind === "image" ? "generated" : "out";
        if (newNode.type === "promptList" && to.handleId === "inVideo") {
          outHandle = "outVideo";
        }
        const nodesSnapTo = [...(getNodes() as WorkflowCanvasNode[]), newNode];
        setEdges((eds) => {
          const next = addEdge(
            {
              id: `e-${newNode.id}-${to.nodeId}-${crypto.randomUUID().slice(0, 8)}`,
              source: newNode.id,
              sourceHandle: outHandle,
              target: to.nodeId,
              targetHandle: to.handleId,
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
            eds,
          );
          patchWorkflowVideoGeneratorPromptAfterConnect(
            setNodes,
            computeVideoGeneratorElementPromptAugmentation({
              nodes: nodesSnapTo,
              edges: next,
              targetId: to.nodeId,
              targetHandle: to.handleId,
            }),
          );
          return next;
        });
      }
      setPlacementPicker(null);
      const linked = (from && connectableFrom) || (to && connectableTo);
      toast.success(linked ? "Node connected" : "Node added");
    },
    [placementPicker, setNodes, setEdges, getNodes],
  );

  const pickUploadAtPlacement = useCallback(() => {
    const pendingConnect = placementPicker?.connectTo
      ? {
          targetNodeId: placementPicker.connectTo.nodeId,
          targetHandleId: placementPicker.connectTo.handleId,
          flow: placementPicker.flow,
        }
      : undefined;
    let fileAccept: string | undefined;
    if (pendingConnect) {
      const target = (nodes as WorkflowCanvasNode[]).find((n) => n.id === pendingConnect.targetNodeId);
      if (target?.type === "adAsset") {
        const d = target.data as AdAssetNodeData;
        if (d.kind === "motion" && pendingConnect.targetHandleId === "inVideo") {
          fileAccept = WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT;
        }
        if (d.kind === "video") {
          const vm = resolveWorkflowVideoModelId(d.model ?? "");
          if (vm === "bytedance/seedance-2" || vm === "bytedance/seedance-2-fast") {
            const h = pendingConnect.targetHandleId;
            if (h === "references" || h === "inImage" || h === "startImage" || h === "inVideo") {
              fileAccept = WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT;
            }
          }
        }
      }
    }
    setPlacementPicker(null);
    window.dispatchEvent(
      new CustomEvent("workflow:open-upload-picker", { detail: { pendingConnect, fileAccept } }),
    );
  }, [placementPicker, nodes]);

  const pickAvatarAtPlacement = useCallback(() => {
    const pendingConnect = placementPicker?.connectTo
      ? {
          targetNodeId: placementPicker.connectTo.nodeId,
          targetHandleId: placementPicker.connectTo.handleId,
          flow: placementPicker.flow,
        }
      : undefined;
    setPlacementPicker(null);
    window.dispatchEvent(new CustomEvent("workflow:open-avatar-picker", { detail: { pendingConnect } }));
  }, [placementPicker]);

  const placementSourceKind = useMemo<WorkflowConnectionDataKind | null>(() => {
    const from = placementPicker?.connectFrom;
    if (!from) return null;
    const fromNode = (nodes as WorkflowCanvasNode[]).find((n) => n.id === from.nodeId);
    return sourceKindFromNodeHandle(fromNode, from.handleId);
  }, [placementPicker, nodes]);

  /**
   * Sync the live React Flow graph back into the parent `workflowProject` state.
   * No debounce: users expect node/link edits to persist like text input.
   */
  useEffect(() => {
    if (skipCanvasSyncPassesRef.current > 0) {
      skipCanvasSyncPassesRef.current -= 1;
      return;
    }
    const id = project.activePageId;
    setProject((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === id ? { ...p, nodes, edges } : p)),
    }));
  }, [nodes, edges, project.activePageId, setProject]);

  /**
   * Write-through persistence: write canvas state to localStorage on each mutation.
   * Intentionally immediate (no debounce) to match "typed text is saved right away".
   */
  useEffect(() => {
    if (skipCanvasSyncPassesRef.current > 0) {
      skipCanvasSyncPassesRef.current -= 1;
      return;
    }
    if (!onCanvasPersist) return;
    const id = project.activePageId;
    const safeClone = <T,>(value: T): T => {
      try {
        return structuredClone(value);
      } catch {
        return JSON.parse(JSON.stringify(value)) as T;
      }
    };
    const snapshot: WorkflowProjectStateV1 = {
      ...project,
      pages: project.pages.map((p) =>
        p.id === id ? { ...p, nodes: safeClone(nodes), edges: safeClone(edges) } : p,
      ),
    };
    try {
      onCanvasPersist(snapshot);
    } catch {
      /* best-effort write-through */
    }
  }, [nodes, edges, project, onCanvasPersist]);

  useEffect(() => {
    if (!canvasProjectFlushRef) return;
    const flush = (): WorkflowProjectStateV1 => {
      const id = project.activePageId;
      // Prefer the React state snapshot kept in `nodesEdgesRef`: it's plain JSON-shaped
      // data we set via `setNodes` / `setEdges`, whereas `getNodes()` from the React Flow
      // store can carry internal fields that occasionally break `structuredClone`.
      const snap = nodesEdgesRef.current;
      const liveNodes = (snap?.nodes ?? (getNodes() as WorkflowCanvasNode[])) as WorkflowCanvasNode[];
      const liveEdges = snap?.edges ?? getEdges();
      const safeClone = <T,>(value: T): T => {
        try {
          return structuredClone(value);
        } catch {
          return JSON.parse(JSON.stringify(value)) as T;
        }
      };
      return {
        ...project,
        pages: project.pages.map((p) =>
          p.id === id ? { ...p, nodes: safeClone(liveNodes), edges: safeClone(liveEdges) } : p,
        ),
      };
    };
    canvasProjectFlushRef.current = flush;
    return () => {
      if (canvasProjectFlushRef.current === flush) {
        canvasProjectFlushRef.current = null;
      }
    };
  }, [canvasProjectFlushRef, project, getNodes, getEdges]);

  const selectPage = useCallback(
    (id: string) => {
      if (id === project.activePageId) return;
      const snap = nodesEdgesRef.current;
      setProject((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === prev.activePageId && snap ? { ...p, nodes: snap.nodes, edges: snap.edges } : p,
        ),
        activePageId: id,
      }));
    },
    [project.activePageId, setProject],
  );

  const addPage = useCallback(() => {
    const snap = nodesEdgesRef.current;
    setProject((prev) => {
      const page = newPage(`Page ${prev.pages.length + 1}`);
      return {
        ...prev,
        pages: [
          ...prev.pages.map((p) =>
            p.id === prev.activePageId && snap ? { ...p, nodes: snap.nodes, edges: snap.edges } : p,
          ),
          page,
        ],
        activePageId: page.id,
      };
    });
  }, [setProject]);

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      if (readOnly) return;
      const nid = params.nodeId?.trim();
      if (!nid) {
        connectInteractionOriginRef.current = null;
        return;
      }
      connectInteractionOriginRef.current = {
        nodeId: nid,
        handleId: params.handleId?.trim() ? params.handleId.trim() : null,
      };
    },
    [readOnly],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      const { source, sourceHandle, target, targetHandle } = params;
      if (!target || !source) return;
      const allNodes = getNodes() as WorkflowCanvasNode[];
      const sourceNode = allNodes.find((n) => n.id === source);
      const targetNode = allNodes.find((n) => n.id === target);
      const srcKind = sourceKindFromNodeHandle(sourceNode, sourceHandle);
      const resolvedTargetHandle =
        targetHandle ??
        (targetNode ? targetHandleForNewNodeFromSourceKind(targetNode as WorkflowCanvasNode, srcKind) : null);
      if (!workflowHandlesAllowConnect(sourceNode, sourceHandle, targetNode, resolvedTargetHandle)) {
        toast.error("Incompatible connection", {
          description: "This output type can only connect to a matching input type.",
        });
        return;
      }
      const handleId = resolvedTargetHandle ?? "";
      let replaceSameHandle = false;
      if (targetNode?.type === "adAsset") {
        const kind = (targetNode.data as AdAssetNodeData).kind;
        // Text ports (`text` / `inText`) accept multiple upstream text modules; do not replace.
        if (
          handleId === "startImage" &&
          (kind === "video" || kind === "variation" || kind === "upscale")
        )
          replaceSameHandle = true;
        if (handleId === "startImage" && kind === "assistant") replaceSameHandle = true;
        if (handleId === "endImage" && kind === "video") replaceSameHandle = true;
        if (handleId === "startImage" && kind === "motion") replaceSameHandle = true;
        if (handleId === "inVideo" && kind === "motion") replaceSameHandle = true;
        if (handleId === "references" && kind === "website") replaceSameHandle = true;
        if (handleId === "references" && kind === "assistant") replaceSameHandle = true;
      }
      const currentEdges = getEdges();
      const base = replaceSameHandle
        ? currentEdges.filter((e) => !(e.target === target && (e.targetHandle ?? "") === handleId))
        : currentEdges;
      const next = addEdge(
        {
          ...params,
          id: `e-${source}-${target}-${crypto.randomUUID().slice(0, 8)}`,
          targetHandle: resolvedTargetHandle ?? null,
          style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
        },
        base,
      );
      setEdges(next);
      patchWorkflowVideoGeneratorPromptAfterConnect(
        setNodes,
        computeVideoGeneratorElementPromptAugmentation({
          nodes: allNodes,
          edges: next,
          targetId: target,
          targetHandle: resolvedTargetHandle,
        }),
      );
      // Bypass the 200ms autosave debounce: the connection lands in workflowProject
      // (and therefore localStorage) instantly. Otherwise a fast reload right after
      // making the connection would lose the new edge.
      commitProjectSnapshotNow(allNodes, next);
    },
    [readOnly, setEdges, setNodes, getNodes, getEdges, commitProjectSnapshotNow],
  );
  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (params) => {
      const { source, sourceHandle, target, targetHandle } = params;
      if (!source || !target) return false;
      const allNodes = getNodes() as WorkflowCanvasNode[];
      const sourceNode = allNodes.find((n) => n.id === source);
      const targetNode = allNodes.find((n) => n.id === target);
      return workflowHandlesAllowConnect(sourceNode, sourceHandle, targetNode, targetHandle);
    },
    [getNodes],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: WorkflowCanvasNode) => {
      if (readOnly) return;

      const last = lastAlignTargetRef.current;
      alignHoldCandidateRef.current = null;
      setAlignGuides({ x: null, y: null });

      // Replace: when the snap target was computed during drag, ensure the final position is exactly on the guide.
      if (last && last.nodeId === node.id && (last.x != null || last.y != null)) {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== node.id) return n;
            return {
              ...n,
              position: { x: last.x ?? n.position.x, y: last.y ?? n.position.y },
            } as WorkflowCanvasNode;
          }),
        );
      }
      lastAlignTargetRef.current = null;

      if (node.type !== "adAsset" && node.type !== "imageRef") return;
      const all = getNodes() as WorkflowCanvasNode[];
      const selectedConnectable = all.filter((n) => n.selected && (n.type === "adAsset" || n.type === "imageRef"));
      if (selectedConnectable.length !== 1 || selectedConnectable[0]?.id !== node.id) return;

      const draggedId = node.id;
      const tryLink = () => {
        const pair = suggestAutoConnectAfterNodeDrag(draggedId, getNodes, getInternalNode);
        if (!pair) return;
        const snapshot = getNodes() as WorkflowCanvasNode[];
        const eds = getEdges();
        if (eds.some((e) => e.source === pair.source && e.target === pair.target)) return;
        const srcNode = snapshot.find((n) => n.id === pair.source);
        const tgtNode = snapshot.find((n) => n.id === pair.target);
        const srcAdKind =
          srcNode?.type === "adAsset" ? (srcNode.data as AdAssetNodeData).kind : undefined;
        const srcHandle =
          srcNode?.type === "adAsset" &&
          (srcAdKind === "image" || srcAdKind === "variation" || srcAdKind === "upscale")
            ? "generated"
            : "out";
        const srcKind = sourceKindFromNodeHandle(srcNode as WorkflowCanvasNode | undefined, srcHandle);
        const targetHandleResolved =
          tgtNode?.type === "adAsset"
            ? targetHandleForNewNodeFromSourceKind(tgtNode as WorkflowCanvasNode, srcKind)
            : tgtNode?.type === "imageRef"
              ? "in"
              : null;
        if (!targetHandleResolved) return;
        const next = addEdge(
          {
            id: `e-${pair.source}-${pair.target}-${crypto.randomUUID().slice(0, 8)}`,
            source: pair.source,
            sourceHandle: srcHandle,
            target: pair.target,
            targetHandle: targetHandleResolved,
            style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
          },
          eds,
        );
        setEdges(next);
        patchWorkflowVideoGeneratorPromptAfterConnect(
          setNodes,
          computeVideoGeneratorElementPromptAugmentation({
            nodes: snapshot,
            edges: next,
            targetId: pair.target,
            targetHandle: targetHandleResolved,
          }),
        );
        // Same reason as onConnect: persist immediately so we don't lose the auto-linked edge
        // if the user reloads/navigates within the 200ms autosave window.
        commitProjectSnapshotNow(snapshot, next);
      };
      requestAnimationFrame(() => requestAnimationFrame(tryLink));
    },
    [readOnly, getInternalNode, getNodes, getEdges, setEdges, setNodes, setAlignGuides, commitProjectSnapshotNow],
  );

  const onNodeDrag = useCallback(
    (_event: unknown, node: WorkflowCanvasNode) => {
      if (readOnly) return;
      if (node.type === "workflowGroup") return;
      // Throttle the alignment computation to ~60 fps to keep dragging smooth
      // with many nodes on the canvas.
      const now = performance.now();
      if (now - lastDragAlignAtRef.current < 16) return;
      lastDragAlignAtRef.current = now;
      const ALIGN_HOLD_MS = 280;
      const selected = (getNodes() as WorkflowCanvasNode[]).filter((n) => n.selected);
      if (selected.length !== 1 || selected[0]?.id !== node.id) {
        alignHoldCandidateRef.current = null;
        setAlignGuides({ x: null, y: null });
        return;
      }

      const dragInternal = getInternalNode(node.id);
      const dragW = dragInternal?.measured?.width ?? node.width ?? 0;
      const dragH = dragInternal?.measured?.height ?? node.height ?? 0;
      if (!dragW || !dragH) {
        alignHoldCandidateRef.current = null;
        setAlignGuides({ x: null, y: null });
        return;
      }

      const snapThreshold = 8;
      const dragLeft = node.position.x;
      const dragTop = node.position.y;
      const dragXAnchors = [dragLeft, dragLeft + dragW / 2, dragLeft + dragW];
      const dragYAnchors = [dragTop, dragTop + dragH / 2, dragTop + dragH];

      let bestX: { delta: number; guide: number } | null = null;
      let bestY: { delta: number; guide: number } | null = null;

      const all = getNodes() as WorkflowCanvasNode[];
      for (const other of all) {
        if (other.id === node.id) continue;
        if (other.parentId && node.parentId && other.parentId !== node.parentId) continue;
        const oi = getInternalNode(other.id);
        const ow = oi?.measured?.width ?? other.width ?? 0;
        const oh = oi?.measured?.height ?? other.height ?? 0;
        if (!ow || !oh) continue;
        const oPos = oi?.internals.positionAbsolute ?? other.position;
        const ox = [oPos.x, oPos.x + ow / 2, oPos.x + ow];
        const oy = [oPos.y, oPos.y + oh / 2, oPos.y + oh];

        for (const da of dragXAnchors) {
          for (const oa of ox) {
            const d = oa - da;
            const ad = Math.abs(d);
            if (ad > snapThreshold) continue;
            if (!bestX || ad < Math.abs(bestX.delta)) bestX = { delta: d, guide: oa };
          }
        }
        for (const da of dragYAnchors) {
          for (const oa of oy) {
            const d = oa - da;
            const ad = Math.abs(d);
            if (ad > snapThreshold) continue;
            if (!bestY || ad < Math.abs(bestY.delta)) bestY = { delta: d, guide: oa };
          }
        }
      }

      if (!bestX && !bestY) {
        alignHoldCandidateRef.current = null;
        setAlignGuides({ x: null, y: null });
        return;
      }

      const holdNow = Date.now();
      const hold = alignHoldCandidateRef.current;
      const sameGuide = (a: number | null | undefined, b: number | null | undefined) => {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return Math.abs(a - b) < 0.5;
      };
      const isSameCandidate =
        hold &&
        hold.nodeId === node.id &&
        sameGuide(hold.guideX, bestX?.guide) &&
        sameGuide(hold.guideY, bestY?.guide);
      if (!isSameCandidate) {
        alignHoldCandidateRef.current = {
          nodeId: node.id,
          guideX: bestX?.guide ?? null,
          guideY: bestY?.guide ?? null,
          sinceMs: holdNow,
        };
        setAlignGuides({ x: null, y: null });
        return;
      }
      if (holdNow - hold.sinceMs < ALIGN_HOLD_MS) {
        setAlignGuides({ x: null, y: null });
        return;
      }

      const nextX = bestX ? node.position.x + bestX.delta : node.position.x;
      const nextY = bestY ? node.position.y + bestY.delta : node.position.y;
      if (nextX !== node.position.x || nextY !== node.position.y) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id
              ? ({
                  ...n,
                  position: { x: nextX, y: nextY },
                } as WorkflowCanvasNode)
              : n,
          ),
        );
      }
      const guideX = bestX?.guide ?? null;
      const guideY = bestY?.guide ?? null;
      lastAlignTargetRef.current = { nodeId: node.id, x: guideX, y: guideY };
      setAlignGuides({ x: guideX, y: guideY });
    },
    [readOnly, getNodes, getInternalNode, setNodes],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (readOnly) return;
      const origin = connectInteractionOriginRef.current;
      try {
        const raw = connectionState as FinalConnectionState & {
          fromNodeId?: string | null;
          fromHandleId?: string | null;
        };
        const fromNodeId =
          connectionState.fromNode?.id ??
          connectionState.fromHandle?.nodeId ??
          raw.fromNodeId ??
          origin?.nodeId ??
          null;
        const fromHandleId =
          connectionState.fromHandle?.id ??
          raw.fromHandleId ??
          origin?.handleId ??
          null;
        // Some RF versions do not reliably populate `fromNode`/`fromHandle` objects on drop-to-empty-canvas.
        if (!fromNodeId) return;
        // Only skip the "create module" picker when a connection actually landed on a valid target.
        if (connectionState.isValid === true && connectionState.toNode) return;

        const pt = getPointerClientPoint(event);
        if (!pt) return;

        const flow = screenToFlowPosition({ x: pt.x, y: pt.y });
        setAddOpen(false);
        setFrameOpen(false);
        // The following `click` on the pane would clear this menu; suppress one pane click (see onPaneClick).
        armPlacementPickerAgainstPaneClick();
        setPlacementPicker({
          flow,
          screenX: pt.x,
          screenY: pt.y,
          connectFrom: { nodeId: fromNodeId, handleId: fromHandleId ?? null },
        });
      } finally {
        connectInteractionOriginRef.current = null;
      }
    },
    [readOnly, screenToFlowPosition, armPlacementPickerAgainstPaneClick],
  );

  useEffect(() => {
    if (readOnly) return;
    const RUN_TIMEOUT_MS = 20 * 60 * 1000;

    const waitForNodeRun = (nodeId: string): Promise<boolean> =>
      new Promise((resolve) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          window.removeEventListener("workflow:node-run-finished", onFinished as EventListener);
          resolve(ok);
        };
        const onFinished = (ev: Event) => {
          const detail = (ev as CustomEvent<{ nodeId?: string; success?: boolean }>).detail;
          if (!detail?.nodeId || detail.nodeId !== nodeId) return;
          finish(detail.success === true);
        };
        const timer = window.setTimeout(() => finish(false), RUN_TIMEOUT_MS);
        window.addEventListener("workflow:node-run-finished", onFinished as EventListener);
      });

    const onRunFromHere = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeId?: string }>).detail;
      const startId = detail?.nodeId?.trim();
      if (!startId) return;

      const byId = new Map(nodes.map((n) => [n.id, n]));
      if (!byId.has(startId)) return;
      const outgoing = new Map<string, string[]>();
      for (const e of edges) {
        if (!outgoing.has(e.source)) outgoing.set(e.source, []);
        outgoing.get(e.source)!.push(e.target);
      }

      const seen = new Set<string>();
      const queue = [startId];
      const reachable: string[] = [];
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        reachable.push(cur);
        for (const nxt of outgoing.get(cur) ?? []) {
          if (!seen.has(nxt)) queue.push(nxt);
        }
      }

      const runIds = reachable.filter((nid) => {
        const n = byId.get(nid);
        return n?.type === "adAsset" && isRunnableWorkflowAdAssetKind((n.data as AdAssetNodeData).kind);
      });
      if (!runIds.length) {
        toast.message("Nothing runnable downstream", {
          description: "No runnable generator nodes were found from this point.",
        });
        return;
      }

      // Run downstream modules in dependency order (topological),
      // so each step gets inputs from earlier upstream runnable nodes.
      const runSet = new Set(runIds);
      const indegree = new Map<string, number>();
      const children = new Map<string, string[]>();
      const reachOrder = new Map<string, number>(reachable.map((nid, idx) => [nid, idx]));
      for (const rid of runIds) {
        indegree.set(rid, 0);
        children.set(rid, []);
      }
      for (const e of edges) {
        if (!runSet.has(e.source) || !runSet.has(e.target)) continue;
        children.get(e.source)!.push(e.target);
        indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
      }
      const ready: string[] = runIds.filter((rid) => (indegree.get(rid) ?? 0) === 0);
      ready.sort((a, b) => (reachOrder.get(a) ?? 0) - (reachOrder.get(b) ?? 0));
      const orderedRunIds: string[] = [];
      while (ready.length) {
        const cur = ready.shift()!;
        orderedRunIds.push(cur);
        for (const nxt of children.get(cur) ?? []) {
          const nextDeg = (indegree.get(nxt) ?? 0) - 1;
          indegree.set(nxt, nextDeg);
          if (nextDeg === 0) {
            ready.push(nxt);
            ready.sort((a, b) => (reachOrder.get(a) ?? 0) - (reachOrder.get(b) ?? 0));
          }
        }
      }
      // Fallback for any unexpected cycle: keep deterministic order and still run everything.
      if (orderedRunIds.length !== runIds.length) {
        for (const rid of runIds) {
          if (!orderedRunIds.includes(rid)) orderedRunIds.push(rid);
        }
      }

      void (async () => {
        setRunFromHereParamLock(true);
        try {
          const estimatedCredits = orderedRunIds.reduce((sum, nid) => {
          const n = byId.get(nid);
          if (!n || n.type !== "adAsset") return sum;
          const d = n.data as AdAssetNodeData;
          return sum + estimateWorkflowAdAssetRunCredits(d, nid, nodes, edges);
          }, 0);
          const creditsLabel =
            estimatedCredits > 0
              ? `${orderedRunIds.length} node(s) queued • ~${Math.round(estimatedCredits)} credits (charged step-by-step).`
              : `${orderedRunIds.length} node(s) queued.`;
          toast.message("Run from here", { description: creditsLabel });
          for (let i = 0; i < orderedRunIds.length; i++) {
            const nodeId = orderedRunIds[i]!;
            window.dispatchEvent(new CustomEvent("workflow:run-node", { detail: { nodeId } }));
            const ok = await waitForNodeRun(nodeId);
            if (!ok) {
              toast.error("Run chain stopped", {
                description: `Node ${i + 1}/${orderedRunIds.length} failed or timed out.`,
              });
              return;
            }
          }
          toast.success("Run chain completed");
        } finally {
          setRunFromHereParamLock(false);
        }
      })();
    };

    window.addEventListener("workflow:run-from-here", onRunFromHere as EventListener);
    return () => window.removeEventListener("workflow:run-from-here", onRunFromHere as EventListener);
  }, [edges, nodes, readOnly]);

  const activeName = activePage?.name ?? "Page";

  const patchNodeData = useCallback(
    (
      nodeId: string,
      patch: Partial<
        AdAssetNodeData &
          WorkflowGroupNodeData &
          StickyNoteNodeData &
          TextPromptNodeData &
          PromptListNodeData &
          ImageRefNodeData
      >,
    ) => {
      // Only block user-editable parameter keys during a run-from-here chain.
      // Output fields (assistantMode, assistantOutput, websiteLastRunAt, outputPreviewUrl, etc.)
      // must NOT be blocked — they carry the actual results produced by the running node.
      const blockedAdAssetParamKeys: (keyof AdAssetNodeData)[] = [
        "label",
        "prompt",
        "model",
        "aspectRatio",
        "resolution",
        "quantity",
        "assistantModel",
        "assistantExportMode",
        "websiteUrl",
        "websiteOutputMode",
        "websiteProductImageCount",
        "videoDurationSec",
        "videoPriority",
        "motionAutoSettings",
        "motionBackgroundSource",
      ];
      // Honor the run-from-here parameter lock for adAsset modules: when active,
      // skip patches that touch blocked keys on `adAsset` nodes (regardless of
      // which page they live on).
      if (runFromHereParamLock) {
        let blocked = false;
        // Find the node anywhere in the project to check its type.
        const liveNodes = nodesEdgesRef.current?.nodes ?? [];
        let targetNode: WorkflowCanvasNode | undefined = liveNodes.find((n) => n.id === nodeId);
        if (!targetNode) {
          for (const p of projectRef.current.pages) {
            const found = p.nodes.find((n) => n.id === nodeId);
            if (found) {
              targetNode = found as WorkflowCanvasNode;
              break;
            }
          }
        }
        if (targetNode?.type === "adAsset") {
          const hasBlockedKey = blockedAdAssetParamKeys.some((k) =>
            Object.prototype.hasOwnProperty.call(patch, k),
          );
          if (hasBlockedKey) blocked = true;
        }
        if (blocked) {
          const now = Date.now();
          if (now - runFromHereLockToastAtRef.current > 1400) {
            runFromHereLockToastAtRef.current = now;
            toast.message("Parameters locked during Run from here", {
              description: "Wait for the chain to finish before editing module settings.",
            });
          }
          return;
        }
      }
      patchNodeDataAcrossPages(nodeId, patch);
    },
    [runFromHereParamLock, patchNodeDataAcrossPages],
  );

  const cloneSelection = useCallback(
    (selectionOverride?: WorkflowCanvasNode[]) => {
      const effectiveSelection = selectionOverride ?? selectedNodes;
      const res = cloneWorkflowSelection(nodes, edges, effectiveSelection);
      if (!res) {
        toast.error("Nothing to duplicate", {
          description: "Select a group, a generator, a prompt text module, or a canvas note.",
        });
        return;
      }
      const { nodesToAdd, edgesToAdd, selectIds } = res;
      const selectSet = new Set(selectIds);
      const nextNodes = [
        ...nodes.map((n) => ({ ...n, selected: false })),
        ...nodesToAdd.map((n) => ({ ...n, selected: selectSet.has(n.id) })),
      ];
      const nextEdges = migrateImageGeneratorOutEdgesToGenerated(nextNodes, [...edges, ...edgesToAdd]);
      setNodes(nextNodes);
      setEdges(nextEdges);
      toast.success("Duplicated");
    },
    [nodes, edges, selectedNodes, setNodes, setEdges],
  );

  const canCutSelection = useMemo(
    () => !readOnly && buildWorkflowClipboardPayload(nodes, edges, selectedNodes) !== null,
    [readOnly, nodes, edges, selectedNodes],
  );

  const applyWorkflowPaste = useCallback(
    (payload: WorkflowClipboardPayloadV1) => {
      const res = remapPastedWorkflowPayload(payload, edges);
      if (!res) return;
      const { nodesToAdd, edgesToAdd, selectIds } = res;
      const selectSet = new Set(selectIds);
      const nextNodes = [
        ...nodes.map((n) => ({ ...n, selected: false })),
        ...nodesToAdd.map((n) => ({ ...n, selected: selectSet.has(n.id) })),
      ];
      const nextEdges = migrateImageGeneratorOutEdgesToGenerated(nextNodes, [...edges, ...edgesToAdd]);
      setNodes(nextNodes);
      setEdges(nextEdges);
      toast.success("Pasted");
    },
    [nodes, edges, setNodes, setEdges],
  );

  const cutSelection = useCallback(() => {
    const payload = buildWorkflowClipboardPayload(nodes, edges, selectedNodes);
    if (!payload) {
      toast.error("Nothing to cut", {
        description: "Select a group, a generator, a prompt text module, or a canvas note.",
      });
      return;
    }
    void (async () => {
      try {
        await writeWorkflowClipboardPayload(payload);
        const ids = new Set(payload.nodes.map((n) => n.id));
        const { nodes: nextNodes, edges: nextEdges } = removeWorkflowNodesById(nodes, edges, ids);
        setNodes(nextNodes.map((n) => ({ ...n, selected: false })));
        setEdges(nextEdges);
        setSelectionBarExpanded(false);
        toast.success("Cut to clipboard");
      } catch {
        toast.error("Could not cut", { description: "Clipboard access was blocked." });
      }
    })();
  }, [nodes, edges, selectedNodes, setNodes, setEdges]);

  const cutEdgeAtPointer = useCallback((edgeId: string): boolean => {
    if (cutTargetBusyRef.current) return false;
    cutTargetBusyRef.current = true;
    let removed = false;
    setEdges((eds) => {
      const next = eds.filter((e) => e.id !== edgeId);
      removed = next.length < eds.length;
      return next;
    });
    cutTargetBusyRef.current = false;
    if (removed) toast.success("Connection cut");
    return removed;
  }, [setEdges]);
  const playCutSnipFxAt = useCallback((x: number, y: number) => {
    setCutSnipFx({ x, y });
    if (cutSnipClearTimerRef.current) clearTimeout(cutSnipClearTimerRef.current);
    cutSnipClearTimerRef.current = setTimeout(() => {
      cutSnipClearTimerRef.current = null;
      setCutSnipFx(null);
    }, 650);
  }, []);

  const edgeEndpointFlowPoint = useCallback(
    (nodeId: string, edgeHandleId: string | null | undefined, side: "source" | "target"): { x: number; y: number } | null => {
      const n = getInternalNode(nodeId) as WorkflowRfInternalLayout | undefined;
      if (!n) return null;
      const abs = n.internals?.positionAbsolute ?? n.positionAbsolute ?? n.position;
      if (!abs || typeof abs.x !== "number" || typeof abs.y !== "number") return null;
      const width = (n.measured?.width ?? n.width ?? 0) as number;
      const height = (n.measured?.height ?? n.height ?? 0) as number;
      const handleCandidates = n.internals?.handleBounds?.[side] as Array<{ id?: string | null; x: number; y: number; width: number; height: number }> | undefined;
      const picked =
        handleCandidates?.find((h) => (edgeHandleId ?? null) === (h.id ?? null)) ??
        handleCandidates?.[0];
      if (picked && Number.isFinite(picked.x) && Number.isFinite(picked.y)) {
        return {
          x: abs.x + picked.x + (picked.width ?? 0) / 2,
          y: abs.y + picked.y + (picked.height ?? 0) / 2,
        };
      }
      return side === "source"
        ? { x: abs.x + width, y: abs.y + height / 2 }
        : { x: abs.x, y: abs.y + height / 2 };
    },
    [getInternalNode],
  );

  const cutEdgesCrossingTrail = useCallback(
    (trailFlow: { x: number; y: number }[]): number => {
      if (trailFlow.length < 2) return 0;
      const hitIds = new Set<string>();
      for (const e of edges) {
        const a = edgeEndpointFlowPoint(e.source, e.sourceHandle ?? null, "source");
        const b = edgeEndpointFlowPoint(e.target, e.targetHandle ?? null, "target");
        if (!a || !b) continue;
        for (let i = 1; i < trailFlow.length; i += 1) {
          if (segmentsIntersect(trailFlow[i - 1]!, trailFlow[i]!, a, b)) {
            hitIds.add(e.id);
            break;
          }
        }
      }
      if (!hitIds.size) return 0;
      setEdges((eds) => eds.filter((e) => !hitIds.has(e.id)));
      return hitIds.size;
    },
    [edges, edgeEndpointFlowPoint, setEdges],
  );

  const copySelection = useCallback(() => {
    const payload = buildWorkflowClipboardPayload(nodes, edges, selectedNodes);
    if (!payload) {
      toast.error("Nothing to copy", {
        description: "Select a group, a generator, a prompt text module, or a canvas note.",
      });
      return;
    }
    void writeWorkflowClipboardPayload(payload).then(
      () => toast.success("Copied"),
      () => toast.error("Could not copy", { description: "Clipboard access was blocked." }),
    );
  }, [nodes, edges, selectedNodes]);

  const deleteSelection = useCallback(() => {
    const payload = buildWorkflowClipboardPayload(nodes, edges, selectedNodes);
    if (!payload) {
      toast.error("Nothing to remove", {
        description: "Select a group, a generator, a prompt text module, or a canvas note.",
      });
      return;
    }
    const ids = new Set(payload.nodes.map((n) => n.id));
    const { nodes: nextNodes, edges: nextEdges } = removeWorkflowNodesById(nodes, edges, ids);
    setNodes(nextNodes.map((n) => ({ ...n, selected: false })));
    setEdges(nextEdges);
    setSelectionBarExpanded(false);
    toast.success("Removed");
  }, [nodes, edges, selectedNodes, setNodes, setEdges]);

  useEffect(() => {
    if (!frameOpen) {
      queueMicrotask(() => setSelectionBarExpanded(false));
    }
  }, [frameOpen]);

  useEffect(() => {
    return () => {
      if (edgeHoverTimerRef.current) {
        clearTimeout(edgeHoverTimerRef.current);
        edgeHoverTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly) return;
      if (shouldIgnoreWorkflowCanvasShortcuts()) return;
      const imageFiles = clipboardImageFiles(e);
      if (imageFiles.length > 0) {
        e.preventDefault();
        const file = imageFiles[0]!;
        const isVideo = file.type.startsWith("video/");
        const objectUrl = URL.createObjectURL(file);
        let tempNodeId: string | null = null;
        void (async () => {
          try {
            if (isVideo) {
              const v = document.createElement("video");
              v.preload = "metadata";
              v.src = objectUrl;
              const duration = await new Promise<number>((resolve, reject) => {
                v.onloadedmetadata = () => resolve(Number(v.duration || 0));
                v.onerror = () => reject(new Error("Could not read video duration."));
              });
              if (Number.isFinite(duration) && duration > 15.01) {
                URL.revokeObjectURL(objectUrl);
                setUploadTrimState({ open: true, file, pendingConnect: null });
                return;
              }
            }
            const ar = isVideo
              ? await measureVideoAspectFromObjectUrl(objectUrl)
              : await measureImageAspectFromObjectUrl(objectUrl);
            const position = screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            });
            const baseName = file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Video" : "Image");
            const tempNode = buildImageRefNode(position, {
              imageUrl: objectUrl,
              source: "upload",
              mediaKind: isVideo ? "video" : "image",
              intrinsicAspect: ar,
              label: `${baseName} (uploading...)`,
            });
            tempNodeId = tempNode.id;
            setNodes((prev) => [...prev, tempNode]);
            setAddOpen(false);
            setFrameOpen(false);

            const hostedUrl = await uploadFileToCdn(file, { kind: isVideo ? "video" : "image" });
            patchNodeDataAcrossPages(tempNode.id, {
              imageUrl: hostedUrl,
              label: baseName,
              source: "upload",
              mediaKind: isVideo ? "video" : "image",
              intrinsicAspect: ar,
            });
            toast.success("Image pasted to canvas");
            URL.revokeObjectURL(objectUrl);
          } catch {
            if (tempNodeId) {
              removeNodeAcrossPages(tempNodeId);
            }
            URL.revokeObjectURL(objectUrl);
            toast.error("Could not paste image", { description: "Try copying another image." });
          }
        })();
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const payload = parseWorkflowClipboardText(text);
      if (!payload) return;
      e.preventDefault();
      applyWorkflowPaste(payload);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [
    readOnly,
    applyWorkflowPaste,
    screenToFlowPosition,
    setNodes,
    setEdges,
    setAddOpen,
    setFrameOpen,
    patchNodeDataAcrossPages,
    removeNodeAcrossPages,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreWorkflowCanvasShortcuts()) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        toast.message("Workflow keyboard shortcuts", {
          description: readOnly
            ? "View-only canvas. Press Ctrl+/ or Cmd+/ to open this list."
            : "V Select · H Pan · E Cut links · N Canvas note · Ctrl/Cmd+Shift+A Add · Ctrl/Cmd+Shift+S Share · Delete or Backspace Remove · Ctrl/Cmd+Z Undo · Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y Redo · Ctrl/Cmd+D Duplicate · Ctrl/Cmd+C or X Copy/Cut · Paste images or workflow JSON",
          duration: 10_000,
        });
        return;
      }

      if (readOnly) return;

      if (!mod && !e.altKey && (e.key === "Delete" || e.key === "Backspace")) {
        if (!buildWorkflowClipboardPayload(nodes, edges, selectedNodes)) return;
        e.preventDefault();
        deleteSelection();
        return;
      }

      if (!mod) return;

      const k = e.key.toLowerCase();
      if (k === "z") {
        if (e.shiftKey) {
          if (redoStackRef.current.length === 0) return;
          e.preventDefault();
          onRedo();
        } else {
          if (undoStackRef.current.length === 0) return;
          e.preventDefault();
          onUndo();
        }
        return;
      }
      if (k === "y") {
        if (redoStackRef.current.length === 0) return;
        e.preventDefault();
        onRedo();
        return;
      }
      if (k === "d") {
        let duplicateTargets: WorkflowCanvasNode[] | null = null;
        if (canCloneWorkflowSelection(selectedNodes) && selectedNodes.length > 0) {
          duplicateTargets = selectedNodes;
        } else {
          const lastId = lastClickedWorkflowNodeIdRef.current;
          const lastNode = lastId ? nodes.find((n) => n.id === lastId) : undefined;
          if (lastNode && canCloneWorkflowSelection([lastNode])) {
            duplicateTargets = [lastNode];
          }
        }
        if (!duplicateTargets?.length) return;
        e.preventDefault();
        cloneSelection(duplicateTargets);
        return;
      }
      if (k === "x") {
        if (!buildWorkflowClipboardPayload(nodes, edges, selectedNodes)) return;
        e.preventDefault();
        cutSelection();
      } else if (k === "c") {
        const payload = buildWorkflowClipboardPayload(nodes, edges, selectedNodes);
        if (!payload) return;
        e.preventDefault();
        void writeWorkflowClipboardPayload(payload).then(
          () => toast.success("Copied"),
          () => toast.error("Could not copy", { description: "Clipboard access was blocked." }),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    readOnly,
    nodes,
    edges,
    selectedNodes,
    cutSelection,
    cloneSelection,
    deleteSelection,
    onUndo,
    onRedo,
  ]);

  useEffect(() => {
    if (readOnly || (tool !== "stickyPlace" && tool !== "cutTarget")) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (shouldIgnoreWorkflowCanvasShortcuts()) return;
      setTool("pan");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, tool, setTool]);

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: "rgba(167, 139, 250, 0.42)", strokeWidth: 2 },
      ...(!readOnly && tool === "cutTarget"
        ? { interactionWidth: 44 }
        : !readOnly && tool === "select"
          ? { interactionWidth: 28 }
          : {}),
    }),
    [readOnly, tool],
  );

  return (
    <div
      ref={workspaceRootRef}
      className="relative h-full min-h-0 w-full"
      onMouseDown={(ev) => {
        if (readOnly || tool !== "cutTarget") return;
        if (ev.button !== 0) return;
        const target = ev.target as HTMLElement | null;
        if (!target?.closest(".react-flow")) return;
        if (target.closest(".react-flow__panel")) return;
        if (target.closest(".react-flow__edge")) {
          const edgeId = hoveredEdgeId;
          if (edgeId) {
            ev.preventDefault();
            ev.stopPropagation();
            const ok = cutEdgeAtPointer(edgeId);
            if (ok) {
              playCutSnipFxAt(ev.clientX, ev.clientY);
              setHoveredEdgeScissors(null);
              setHoveredEdgeId(null);
              cutSuppressNextPaneClickRef.current = true;
            }
          }
          return;
        }
        if (target.closest("button, input, textarea, select, [role=\"button\"]")) return;
        cutTrailActiveRef.current = true;
        cutTrailJustFinishedRef.current = false;
        const first = { x: ev.clientX, y: ev.clientY };
        // Seed with 2 points so the cut line is immediately visible while holding.
        setCutTrailPoints([first, first]);
        setHoveredEdgeId(null);
        setHoveredEdgeScissors(null);
      }}
      onMouseMove={(ev) => {
        if (readOnly || tool !== "cutTarget") return;
        if (!cutTrailActiveRef.current) return;
        setCutTrailPoints((prev) => {
          const cur = { x: ev.clientX, y: ev.clientY };
          if (!prev.length) return [cur, cur];
          if (prev.length === 1) return [prev[0]!, cur];
          const next = [...prev];
          const penultimate = next[next.length - 2]!;
          const dxAnchor = cur.x - penultimate.x;
          const dyAnchor = cur.y - penultimate.y;
          // Keep a live endpoint for precision, and add anchors every few px for segment cutting.
          if (dxAnchor * dxAnchor + dyAnchor * dyAnchor >= 36) {
            next.push(cur);
          } else {
            next[next.length - 1] = cur;
          }
          return next;
        });
      }}
      onMouseUp={() => {
        if (readOnly || tool !== "cutTarget") return;
        if (!cutTrailActiveRef.current) return;
        cutTrailActiveRef.current = false;
        setCutTrailPoints((screenPts) => {
          if (screenPts.length >= 2) {
            const flowPts = screenPts.map((p) => screenToFlowPosition(p));
            const removed = cutEdgesCrossingTrail(flowPts);
            if (removed > 0) toast.success(`${removed} connection${removed > 1 ? "s" : ""} cut`);
          }
          return [];
        });
        cutTrailJustFinishedRef.current = true;
      }}
    >
      <WorkflowPagesPanel
        project={project}
        setProject={setProject}
        onSelectPage={selectPage}
        onAddPage={addPage}
        nodesEdgesRef={nodesEdgesRef}
        readOnly={readOnly}
      />

      <WorkflowNodePatchProvider onPatch={patchNodeData}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={readOnly ? undefined : onConnect}
          isValidConnection={readOnly ? undefined : isValidConnection}
          onConnectStart={readOnly ? undefined : onConnectStart}
          onConnectEnd={readOnly ? undefined : onConnectEnd}
          connectionDragThreshold={0}
          connectionRadius={WORKFLOW_CONNECTION_RADIUS}
          onNodeDrag={readOnly ? undefined : onNodeDrag}
          onNodeDragStop={readOnly ? undefined : onNodeDragStop}
          onNodeClick={
            readOnly
              ? undefined
              : (_event, node) => {
                  lastClickedWorkflowNodeIdRef.current = node.id;
                }
          }
          onDragOver={readOnly ? undefined : onDragOver}
          onDrop={readOnly ? undefined : onDrop}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          deleteKeyCode={readOnly ? null : undefined}
          edgesReconnectable={!readOnly}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView={false}
          minZoom={0.05}
          panOnDrag={readOnly ? true : tool === "pan"}
          selectionOnDrag={readOnly ? false : tool === "select"}
          selectionMode={SelectionMode.Partial}
          onSelectionChange={onSelectionChange}
          onEdgeClick={(event, edge) => {
            if (readOnly || tool !== "cutTarget") return;
            event.preventDefault();
            event.stopPropagation();
            const ok = cutEdgeAtPointer(edge.id);
            if (!ok) return;
            playCutSnipFxAt(event.clientX, event.clientY);
            setHoveredEdgeScissors(null);
            setHoveredEdgeId(null);
          }}
          onEdgeMouseEnter={readOnly ? undefined : (_ev, edge) => {
            if (tool !== "cutTarget") return;
            setHoveredEdgeId(edge.id);
            setHoveredEdgeScissors(null);
            if (edgeHoverTimerRef.current) clearTimeout(edgeHoverTimerRef.current);
            edgeHoverTimerRef.current = setTimeout(() => {
              edgeHoverTimerRef.current = null;
              const pt = lastEdgePointerRef.current;
              if (!pt) return;
              setHoveredEdgeScissors({ x: pt.x, y: pt.y });
            }, 1000);
          }}
          onEdgeMouseMove={readOnly ? undefined : (ev) => {
            if (tool !== "cutTarget") return;
            lastEdgePointerRef.current = { x: ev.clientX, y: ev.clientY };
            // If the scissors is already visible, keep it glued to the pointer.
            if (hoveredEdgeScissors) {
              setHoveredEdgeScissors({
                x: ev.clientX,
                y: ev.clientY,
              });
            }
          }}
          onEdgeMouseLeave={readOnly ? undefined : () => {
            setHoveredEdgeId(null);
            setHoveredEdgeScissors(null);
            lastEdgePointerRef.current = null;
            if (edgeHoverTimerRef.current) {
              clearTimeout(edgeHoverTimerRef.current);
              edgeHoverTimerRef.current = null;
            }
          }}
          onPaneClick={(ev) => {
            if (suppressWorkflowPaneClickRef.current) {
              suppressWorkflowPaneClickRef.current = false;
              return;
            }
            setAddOpen(false);
            setFrameOpen(false);
            setSelectionBarExpanded(false);
            setPlacementPicker(null);
            setAlignGuides({ x: null, y: null });
            if (!readOnly && tool === "cutTarget") {
              if (cutTrailJustFinishedRef.current) {
                cutTrailJustFinishedRef.current = false;
                return;
              }
              if (cutSuppressNextPaneClickRef.current) {
                cutSuppressNextPaneClickRef.current = false;
                return;
              }
              // Stay in cut mode; user exits via Esc or toolbar toggle.
              return;
            }
            if (!readOnly && tool === "stickyPlace") {
              const zoom = getViewport().zoom;
              const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
              const dx = 100 / zoom;
              const dy = 36 / zoom;
              setNodes((prev) => [...prev, buildStickyNoteNode({ x: p.x - dx, y: p.y - dy })]);
              toast.success("Note added");
            }
          }}
          onPaneContextMenu={readOnly ? undefined : (ev) => {
            // Standard workflow-builder pattern: right-click on empty canvas opens quick add picker.
            ev.preventDefault();
            if (tool === "cutTarget") return;
            const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
            armPlacementPickerAgainstPaneClick();
            setAddOpen(false);
            setFrameOpen(false);
            setSelectionBarExpanded(false);
            setPlacementPicker({
              flow,
              screenX: ev.clientX,
              screenY: ev.clientY,
              intent: "generic",
            });
          }}
          className={cn(
            "workflow-flow relative z-[1] !bg-transparent",
            readOnly && "workflow-template-readonly",
            (readOnly || tool === "pan") && "workflow-pan-mode",
            !readOnly && tool === "select" && "workflow-select-mode",
            !readOnly && tool === "stickyPlace" && "workflow-sticky-place-mode",
            !readOnly && tool === "cutTarget" && "workflow-cut-target-mode",
          )}
          defaultEdgeOptions={defaultEdgeOptions}
        >
          {!readOnly && tool === "cutTarget" && cutTrailPoints.length >= 1 ? (
            <svg className="pointer-events-none absolute inset-0 z-[130]" aria-hidden>
              {(() => {
                const rect = workspaceRootRef.current?.getBoundingClientRect();
                if (!rect) return null;
                const localPts = cutTrailPoints.map((p) => ({ x: p.x - rect.left, y: p.y - rect.top }));
                if (localPts.length === 1) {
                  const p = localPts[0]!;
                  return (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={10}
                      fill="rgba(251, 113, 133, 0.12)"
                      stroke="rgba(251, 113, 133, 0.95)"
                      strokeWidth={2}
                      strokeDasharray="6 5"
                    />
                  );
                }
                return (
                  <polyline
                    points={localPts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="rgba(251, 113, 133, 0.95)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="8 7"
                  />
                );
              })()}
            </svg>
          ) : null}
          {!readOnly && tool === "select" && hoveredEdgeId && hoveredEdgeScissors ? (
            <button
              type="button"
              className="pointer-events-auto fixed z-[140] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-[#0b0912]/95 text-white/80 shadow-[0_12px_38px_rgba(0,0,0,0.55)] backdrop-blur-md transition hover:border-violet-400/35 hover:bg-white/[0.06] hover:text-white"
              style={{
                left: Math.max(10, Math.min(hoveredEdgeScissors.x, window.innerWidth - 10)),
                top: Math.max(10, Math.min(hoveredEdgeScissors.y, window.innerHeight - 10)),
              }}
              title="Cut link"
              aria-label="Cut link"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const x = e.clientX;
                const y = e.clientY;
                const ok = cutEdgeAtPointer(hoveredEdgeId);
                if (!ok) return;
                playCutSnipFxAt(x, y);
                setHoveredEdgeScissors(null);
                setHoveredEdgeId(null);
              }}
            >
              <Scissors className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}

          <WorkflowReactFlowChrome
            tool={tool}
            setTool={setTool}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            setNodes={setNodes}
            setEdges={setEdges}
            commitProjectSnapshotNow={commitProjectSnapshotNow}
            patchNodeDataAcrossPages={patchNodeDataAcrossPages}
            removeNodeAcrossPages={removeNodeAcrossPages}
            activePageId={project.activePageId}
            activeName={activeName}
            selectedNodes={selectedNodes}
            frameOpen={frameOpen}
            setFrameOpen={setFrameOpen}
            selectionBarExpanded={selectionBarExpanded}
            setSelectionBarExpanded={setSelectionBarExpanded}
            onCloneSelection={cloneSelection}
            onCopySelection={copySelection}
            onDeleteSelection={deleteSelection}
            canCut={canCutSelection}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            uploadTrimState={uploadTrimState}
            setUploadTrimState={setUploadTrimState}
            readOnly={readOnly}
          />
        </ReactFlow>
      </WorkflowNodePatchProvider>

      {!readOnly && cutSnipFx ? <WorkflowCutSnipFx x={cutSnipFx.x} y={cutSnipFx.y} /> : null}

      {!readOnly && (alignGuides.x != null || alignGuides.y != null) && workspaceRootRef.current ? (
        <>
          {alignGuides.x != null ? (
            <div
              className="pointer-events-none fixed z-[125] w-px bg-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              style={{
                left: flowToScreenPosition({ x: alignGuides.x, y: 0 }).x,
                top: workspaceRootRef.current.getBoundingClientRect().top,
                height: workspaceRootRef.current.getBoundingClientRect().height,
              }}
              aria-hidden
            />
          ) : null}
          {alignGuides.y != null ? (
            <div
              className="pointer-events-none fixed z-[125] h-px bg-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              style={{
                top: flowToScreenPosition({ x: 0, y: alignGuides.y }).y,
                left: workspaceRootRef.current.getBoundingClientRect().left,
                width: workspaceRootRef.current.getBoundingClientRect().width,
              }}
              aria-hidden
            />
          ) : null}
        </>
      ) : null}

      {readOnly && showTemplateUseCta && onUseTemplate ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 pt-8">
          <div className="pointer-events-auto flex max-w-[min(100%,560px)] items-center gap-3 rounded-full border border-white/[0.1] bg-[#14141a]/95 py-2.5 pl-4 pr-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md sm:gap-4 sm:pl-5">
            <Eye className="h-4 w-4 shrink-0 text-white/55" strokeWidth={2} aria-hidden />
            <p className="min-w-0 flex-1 text-left text-[12px] leading-snug text-white/75 sm:text-[13px]">
              Make it yours, start from this template.
            </p>
            <button
              type="button"
              disabled={useTemplateBusy}
              onClick={onUseTemplate}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-[13px]"
            >
              {useTemplateBusy ? "Working…" : "Use template"}
            </button>
          </div>
        </div>
      ) : null}

      {readOnly && showSharePreviewCta && onDuplicateSharePreview ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 pt-8">
          <div className="pointer-events-auto flex w-full max-w-[min(100%,560px)] flex-col gap-2.5 rounded-2xl border border-white/[0.1] bg-[#14141a]/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:py-2.5 sm:pl-5 sm:pr-2">
            <Eye className="mx-auto h-4 w-4 shrink-0 text-white/55 sm:mx-0" strokeWidth={2} aria-hidden />
            <p className="min-w-0 flex-1 text-center text-[12px] leading-snug text-white/75 sm:text-left sm:text-[13px]">
              You&apos;re viewing a shared workflow. Sign up or duplicate to edit in your own workspace.
            </p>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {onJoinShareWorkspace && sharePreviewJoinLabel ? (
                <button
                  type="button"
                  disabled={joinShareWorkspaceBusy}
                  onClick={onJoinShareWorkspace}
                  className="rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-[12px] font-semibold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[13px]"
                >
                  {joinShareWorkspaceBusy ? "Joining…" : sharePreviewJoinLabel}
                </button>
              ) : null}
              <button
                type="button"
                disabled={duplicateSharePreviewBusy}
                onClick={onDuplicateSharePreview}
                className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-[13px]"
              >
                {duplicateSharePreviewBusy ? "Working…" : sharePreviewDuplicateLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {placementPicker ? (
        <div
          ref={placementRef}
          role="dialog"
          aria-label={placementPicker.connectFrom ? "Choose node type to connect" : "Choose node type"}
          className="pointer-events-auto fixed z-[200] w-[min(260px,calc(100vw-16px))] rounded-xl border border-white/12 bg-[#0b0912] p-3 shadow-2xl"
          style={{
            left: Math.max(8, Math.min(placementPicker.screenX, window.innerWidth - 268)),
            top: Math.max(8, Math.min(placementPicker.screenY + 12, window.innerHeight - 220)),
          }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            {placementPicker.connectFrom ? "Connect new module" : "Place node"}
          </p>
          <p className="mb-3 text-[12px] text-white/55">
            {placementPicker.intent === "text-input"
              ? "Prompt text is the black module for generation copy. Canvas note is only for annotations on the board."
              : placementPicker.intent === "text-or-image"
                ? "Add a canvas note (annotation) or an image block."
              : placementPicker.intent === "video-input"
                ? "Add a motion reference video: upload a clip, wire a video generator, or use a list of video URLs."
              : placementPicker.intent === "image-input"
                ? "Choose media source or generator for this image input."
                : placementPicker.connectFrom
                  ? "Pick a generator, it will be linked from the previous node."
                  : "What should be created here?"}
          </p>
          <div className="flex max-h-[min(60vh,360px)] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {placementPicker.connectFrom && placementSourceKind === "text" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("image")}
                >
                  Image generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("video")}
                >
                  Video generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("assistant")}
                >
                  Assistant
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("promptList")}
                >
                  List
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("textPrompt")}
                >
                  Prompt text
                </button>
              </>
            ) : placementPicker.connectFrom && placementSourceKind === "image" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-300/45 hover:bg-violet-500/15"
                  onClick={() =>
                    placeNodeAtPicker("image", {
                      label: "360° profile",
                      imageWorkflowPreset: "profile_360",
                    })
                  }
                >
                  360° profile
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("video")}
                >
                  Video generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("image")}
                >
                  Image generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-emerald-500/15 hover:border-emerald-400/40"
                  onClick={() =>
                    placeNodeAtPicker("assistant", {
                      label: "Image → JSON",
                      prompt: WORKFLOW_IMAGE_TO_JSON_USER_PROMPT,
                      assistantVisionPreset: "image_to_json",
                    })
                  }
                >
                  Image → JSON
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("assistant")}
                >
                  Assistant
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("promptList")}
                >
                  List
                </button>
              </>
            ) : placementPicker.connectFrom && placementSourceKind === "video" ? (
              <>
                {workflowVideoGeneratorAcceptsUpstreamVideo(DEFAULT_NEW_VIDEO_GENERATOR_MODEL) ? (
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                    onClick={() =>
                      placeNodeAtPicker("video", {
                        model: VIDEO_CHAIN_NEW_NODE_DEFAULT_MODEL,
                        videoInputMode: "seedance_only",
                      })
                    }
                  >
                    Video generator
                  </button>
                ) : null}
                <p className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] leading-snug text-white/58">
                  Video generator (from video output) is limited to Seedance 2 / Seedance 2 Fast. Seedance 2 Fast is
                  preselected.
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-emerald-400/40 hover:bg-emerald-500/15"
                  onClick={() =>
                    placeNodeAtPicker("assistant", {
                      label: "Video → Prompt",
                      prompt: WORKFLOW_VIDEO_TO_PROMPT_USER_PROMPT,
                      assistantVisionPreset: "video_to_prompt",
                    })
                  }
                >
                  Video → Prompt
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("promptList")}
                >
                  List
                </button>
              </>
            ) : placementPicker.intent === "text-or-image" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("sticky")}
                >
                  Canvas note
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("image")}
                >
                  Image
                </button>
              </>
            ) : placementPicker.intent === "text-input" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("textPrompt")}
                >
                  Prompt text
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("assistant")}
                >
                  Assistant
                </button>
              </>
            ) : placementPicker.intent === "video-input" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={pickUploadAtPlacement}
                >
                  Upload video
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("video")}
                >
                  Video generator
                </button>
              </>
            ) : placementPicker.intent === "image-input" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-300/45 hover:bg-violet-500/15"
                  onClick={() =>
                    placeNodeAtPicker("image", {
                      label: "360° profile",
                      imageWorkflowPreset: "profile_360",
                    })
                  }
                >
                  360° profile
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("image")}
                >
                  Image generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-emerald-400/40 hover:bg-emerald-500/15"
                  onClick={() =>
                    placeNodeAtPicker("assistant", {
                      label: "Image → JSON",
                      prompt: WORKFLOW_IMAGE_TO_JSON_USER_PROMPT,
                      assistantVisionPreset: "image_to_json",
                    })
                  }
                >
                  Image → JSON
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={pickAvatarAtPlacement}
                >
                  Avatar
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={pickUploadAtPlacement}
                >
                  Upload
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("image")}
                >
                  Image generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("video")}
                >
                  Video generator
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-emerald-400/40 hover:bg-emerald-500/15"
                  onClick={() =>
                    placeNodeAtPicker("assistant", {
                      label: "Image → JSON",
                      prompt: WORKFLOW_IMAGE_TO_JSON_USER_PROMPT,
                      assistantVisionPreset: "image_to_json",
                    })
                  }
                >
                  Image → JSON
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("assistant")}
                >
                  Assistant
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("upscale")}
                >
                  Image upscaler
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("variation")}
                >
                  Variation
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("textPrompt")}
                >
                  Prompt text
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("promptList")}
                >
                  List
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("sticky")}
                >
                  Canvas note
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeWorkflowSpaceId(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function WorkflowEditor({
  spaceId,
  shareToken,
}: {
  spaceId: string;
  /** When set, loads a public snapshot from the share token (via `?share=` on the space URL). */
  shareToken?: string;
}) {
  const router = useRouter();
  const sb = useSupabaseBrowserClient();
  const resolvedSpaceId = useMemo(() => normalizeWorkflowSpaceId(spaceId), [spaceId]);
  const shareTokenTrimmed = useMemo(() => (typeof shareToken === "string" ? shareToken.trim() : ""), [shareToken]);

  const [storageScope, setStorageScope] = useState<string | null>(null);
  /** `undefined` = session not resolved yet (avoid redirecting to /workflow on slow mobile). */
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined);
  const [workflowProject, setWorkflowProject] = useState<WorkflowProjectStateV1>(() => defaultWorkflowProject());
  const [workflowHydrated, setWorkflowHydrated] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled workflow");
  const [shareOpen, setShareOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedTemplateId, setPublishedTemplateId] = useState<string | null>(null);
  /**
   * `null` = not yet checked, `"local"` = owned space living in localStorage,
   * `"shared"` = the active user is a collaborator (viewer/editor) on a space
   * owned by someone else; we fetched its state from the server.
   */
  const [spaceSource, setSpaceSource] = useState<"local" | "shared" | null>(null);
  const [spaceRole, setSpaceRole] = useState<string | null>(null);
  const [removeTemplateBusy, setRemoveTemplateBusy] = useState(false);
  const [removeTemplateConfirmOpen, setRemoveTemplateConfirmOpen] = useState(false);
  const [publishTemplateOpen, setPublishTemplateOpen] = useState(false);
  const [publishTemplateName, setPublishTemplateName] = useState("");
  const [publishTemplateBlurb, setPublishTemplateBlurb] = useState("");
  /** Loaded via `/api/workflow/share-preview` (guest or signed-in user not yet a collaborator). */
  const [loadedFromShareLink, setLoadedFromShareLink] = useState(false);
  const [duplicateShareBusy, setDuplicateShareBusy] = useState(false);
  const [joinShareBusy, setJoinShareBusy] = useState(false);
  const [runHistory, setRunHistory] = useState<WorkflowRunLogEntry[]>([]);
  const lastSavedPreviewRef = useRef<string | undefined>(undefined);
  const lastCloudUpdatedAtRef = useRef<string | null>(null);
  const skipNextCloudSaveRef = useRef(false);
  const skipNextLocalSaveRef = useRef(false);
  const runHistoryStorageKey = useMemo(
    () => `youry-workflow-run-history-v1:${resolvedSpaceId}`,
    [resolvedSpaceId],
  );
  /** Live canvas → project merge for publish (parent state sync is debounced ~200ms). */
  const canvasProjectFlushRef = useRef<(() => WorkflowProjectStateV1) | null>(null);

  const appendRunHistory = useCallback((entry: WorkflowRunLogEntry) => {
    setRunHistory((prev) => {
      const next = [entry, ...prev].slice(0, 28);
      try {
        localStorage.setItem(runHistoryStorageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [runHistoryStorageKey]);

  useEffect(() => {
    if (!sb) {
      setStorageScope(getWorkflowStorageScope(null));
      setAuthUserId(null);
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      const id = data.session?.user?.id ?? null;
      setStorageScope(getWorkflowStorageScope(id));
      setAuthUserId(id);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      setStorageScope(getWorkflowStorageScope(id));
      setAuthUserId(id);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  /**
   * Hydrate the active space.
   *
   * 1. Optional `?share=` token: try cloud when signed in (collaborator path), else a
   *    public snapshot so guests can view the canvas without an account.
   * 2. If it lives in the user's local index → load from localStorage (fast path).
   * 3. Otherwise, when signed in, try to fetch the cloud-stored space; this
   *    covers two cases: workflows shared via invite, and workflows created on
   *    another device. We mark them as "shared" so saves go to the server only
   *    and the workflow does not bleed into the local "My workflows" list.
   * 4. If neither is available, redirect back to the landing page.
   */
  useEffect(() => {
    if (storageScope === null) return;
    setWorkflowHydrated(false);
    if (!shareTokenTrimmed) {
      setLoadedFromShareLink(false);
    }

    const idx = loadSpacesIndex(storageScope).spaces;
    const localMeta = idx.find((s) => s.id === resolvedSpaceId);
    let cancelled = false;

    const loadRunHistory = () => {
      try {
        const raw = localStorage.getItem(runHistoryStorageKey);
        const arr = raw ? (JSON.parse(raw) as WorkflowRunLogEntry[]) : [];
        if (Array.isArray(arr)) {
          setRunHistory(
            arr
              .filter((x) => x && typeof x.message === "string" && typeof x.ts === "number")
              .slice(0, 28),
          );
        } else {
          setRunHistory([]);
        }
      } catch {
        setRunHistory([]);
      }
    };

    if (shareTokenTrimmed) {
      if (authUserId === undefined) {
        return;
      }

      void (async () => {
        if (authUserId) {
          const cloud = await fetchCloudWorkflowSpace(resolvedSpaceId);
          if (cancelled) return;
          if (cloud) {
            lastCloudUpdatedAtRef.current = cloud.updatedAt;
            setSpaceSource(cloud.isOwn ? "local" : "shared");
            setSpaceRole(cloud.role);
            setSpaceName(cloud.name || "Untitled workflow");
            setPublishedTemplateId(cloud.publishedCommunityTemplateId ?? null);
            setWorkflowProject(cloud.state);
            setLoadedFromShareLink(false);
            skipNextCloudSaveRef.current = true;
            if (cloud.isOwn) {
              saveProjectForSpace(storageScope, resolvedSpaceId, cloud.state);
              updateSpaceMeta(storageScope, resolvedSpaceId, {
                name: cloud.name || "Untitled workflow",
                updatedAt: Date.parse(cloud.updatedAt) || Date.now(),
                previewDataUrl: cloud.previewDataUrl ?? undefined,
                publishedCommunityTemplateId: cloud.publishedCommunityTemplateId ?? undefined,
              });
            }
            skipNextLocalSaveRef.current = true;
            loadRunHistory();
            setWorkflowHydrated(true);
            return;
          }
        }

        const snap = await fetchWorkflowSharePreview(resolvedSpaceId, shareTokenTrimmed);
        if (cancelled) return;
        if (!snap) {
          router.replace("/workflow");
          return;
        }
        lastCloudUpdatedAtRef.current = snap.updatedAt;
        setSpaceSource("shared");
        setSpaceRole("viewer");
        setSpaceName(snap.name || "Untitled workflow");
        setPublishedTemplateId(snap.publishedCommunityTemplateId ?? null);
        setWorkflowProject(snap.state);
        setLoadedFromShareLink(true);
        skipNextCloudSaveRef.current = true;
        skipNextLocalSaveRef.current = true;
        loadRunHistory();
        setWorkflowHydrated(true);
      })();

      return () => {
        cancelled = true;
      };
    }

    if (localMeta) {
      if (authUserId === undefined) {
        return;
      }
      const localProject = loadProjectForSpace(storageScope, resolvedSpaceId);
      const localUpdatedAtMs = Number(localMeta.updatedAt) || 0;
      if (!authUserId) {
        setSpaceSource("local");
        setSpaceRole(null);
        setSpaceName(localMeta.name);
        setPublishedTemplateId(localMeta.publishedCommunityTemplateId ?? null);
        setWorkflowProject(localProject);
        loadRunHistory();
        setWorkflowHydrated(true);
        return;
      }
      void (async () => {
        const cloud = await fetchCloudWorkflowSpace(resolvedSpaceId);
        if (cancelled) return;
        const cloudUpdatedAtMs = cloud?.updatedAt ? Date.parse(cloud.updatedAt) : NaN;
        const preferCloud =
          Boolean(cloud) &&
          Number.isFinite(cloudUpdatedAtMs) &&
          cloudUpdatedAtMs > localUpdatedAtMs;

        if (preferCloud && cloud) {
          lastCloudUpdatedAtRef.current = cloud.updatedAt;
          setSpaceSource(cloud.isOwn ? "local" : "shared");
          setSpaceRole(cloud.role);
          setSpaceName(cloud.name || "Untitled workflow");
          // Prefer cloud's publishedCommunityTemplateId, but fall back to the local value if
          // the cloud is missing it — this happens when router.push unmounted the editor before
          // the debounced cloud-save could fire with the newly set publishedCommunityTemplateId.
          const mergedTemplateId =
            (cloud.publishedCommunityTemplateId ?? "").trim() ||
            (localMeta.publishedCommunityTemplateId ?? "").trim() ||
            null;
          setPublishedTemplateId(mergedTemplateId);
          setWorkflowProject(cloud.state);
          saveProjectForSpace(storageScope, resolvedSpaceId, cloud.state);
          updateSpaceMeta(storageScope, resolvedSpaceId, {
            name: cloud.name || localMeta.name,
            updatedAt: Number.isFinite(cloudUpdatedAtMs) ? cloudUpdatedAtMs : Date.now(),
            previewDataUrl: cloud.previewDataUrl ?? undefined,
            publishedCommunityTemplateId: mergedTemplateId ?? undefined,
          });
          // Hydration already saved everything — skip the reactive save effects that
          // fire on the initial workflowProject assignment to avoid a timestamp bump.
          skipNextCloudSaveRef.current = true;
          skipNextLocalSaveRef.current = true;
        } else {
          if (cloud?.updatedAt) lastCloudUpdatedAtRef.current = cloud.updatedAt;
          setSpaceSource("local");
          setSpaceRole(cloud?.role ?? null);
          setSpaceName(localMeta.name);
          setPublishedTemplateId(localMeta.publishedCommunityTemplateId ?? null);
          setWorkflowProject(localProject);
          // Project is already persisted in localStorage — skip the reactive local-save
          // that would otherwise call touchSpaceUpdated and bump updatedAt to Date.now().
          skipNextLocalSaveRef.current = true;
        }
        loadRunHistory();
        setWorkflowHydrated(true);
      })();
      return;
    }

    if (authUserId === undefined) {
      return;
    }
    if (authUserId === null) {
      router.replace("/workflow");
      return;
    }

    void (async () => {
      const cloud = await fetchCloudWorkflowSpace(resolvedSpaceId);
      if (cancelled) return;
      if (!cloud) {
        router.replace("/workflow");
        return;
      }
      lastCloudUpdatedAtRef.current = cloud.updatedAt;
      setSpaceSource(cloud.isOwn ? "local" : "shared");
      setSpaceRole(cloud.role);
      setSpaceName(cloud.name || "Untitled workflow");
      setPublishedTemplateId(cloud.publishedCommunityTemplateId ?? null);
      setWorkflowProject(cloud.state);
      // Loaded fresh from cloud — no need to push it straight back.
      skipNextCloudSaveRef.current = true;
      loadRunHistory();
      setWorkflowHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedSpaceId, router, storageScope, runHistoryStorageKey, authUserId, shareTokenTrimmed]);

  useEffect(() => {
    if (!workflowHydrated || storageScope === null) return;
    if (spaceSource === "local") {
      if (skipNextLocalSaveRef.current) {
        skipNextLocalSaveRef.current = false;
        return;
      }
      saveProjectForSpace(storageScope, resolvedSpaceId, workflowProject);
    }
  }, [workflowHydrated, storageScope, resolvedSpaceId, workflowProject, spaceSource]);

  /**
   * Write-through persistence callback handed to `WorkflowFlowWorkspace`. The child
   * invokes this on every nodes/edges mutation (debounced ~50ms) so the canvas
   * lands in localStorage even before the parent `workflowProject` state has
   * caught up via the debounced sync. Without this, fast Cmd+R reloads after
   * making a connection would lose the new edge — pagehide is not a guarantee
   * (some browsers / devtools workflows skip it).
   *
   * Viewers of shared workflows are read-only — never touch their localStorage.
   */
  const persistCanvasNow = useCallback(
    (snapshot: WorkflowProjectStateV1) => {
      if (storageScope === null) return;
      if (spaceSource === "shared" && spaceRole === "viewer") return;
      try {
        saveProjectForSpace(storageScope, resolvedSpaceId, snapshot);
      } catch {
        /* best-effort, quota may have been exceeded */
      }
    },
    [storageScope, resolvedSpaceId, spaceSource, spaceRole],
  );

  /**
   * Last-chance flush before the page is hidden/unloaded.
   *
   * The canvas autosave is debounced (200ms) and so is the cloud sync (1500ms). If the
   * user makes a connection or drags a node and then immediately reloads the tab, the
   * pending change never reaches localStorage and the next load shows a stale state
   * (manifests as "the nodes/edges I just added disappeared").
   *
   * `canvasProjectFlushRef` always holds the latest live React Flow snapshot, so we
   * just synchronously write it to localStorage on pagehide/beforeunload.
   */
  useEffect(() => {
    if (storageScope === null) return;
    if (spaceSource === "shared" && spaceRole === "viewer") return;

    const flushNow = () => {
      try {
        const flushed = canvasProjectFlushRef.current?.();
        if (flushed) {
          saveProjectForSpace(storageScope, resolvedSpaceId, flushed);
        }
      } catch {
        /* best-effort flush */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };

    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
      // The component itself is unmounting (e.g. user navigated to another route via Next.js client nav).
      // Make sure the latest in-memory state hits localStorage before we tear down.
      flushNow();
    };
  }, [storageScope, resolvedSpaceId, spaceSource, spaceRole]);

  /**
   * Mirror to the cloud (debounced) so:
   *  - other collaborators can load up-to-date state, and
   *  - the share dialog can hand out an invite link that actually points to
   *    something even before any explicit "save" gesture.
   *
   * Viewer access is treated as read-only; editors and owners get full sync.
   *
   * When a generation is in flight (`pendingWorkflowRun` set on some node),
   * the debounce is shortened so the cloud copy reliably captures the pending
   * task ids even if the user navigates to another workflow within ~1.5s of
   * clicking Generate. Without this, returning to the workflow on another
   * device (or after a localStorage clear) would never resume polling.
   */
  const workflowHasPendingRun = useMemo(() => {
    for (const page of workflowProject.pages) {
      for (const n of page.nodes) {
        const d = (n as { data?: { pendingWorkflowRun?: { taskIds?: unknown; updatedAt?: unknown } } })
          .data;
        const pending = d?.pendingWorkflowRun;
        if (!pending || typeof pending !== "object") continue;
        const updatedAt = typeof pending.updatedAt === "number" ? pending.updatedAt : 0;
        if (updatedAt > 0 && Date.now() - updatedAt > 5 * 60_000) continue;
        return true;
      }
    }
    return false;
  }, [workflowProject]);

  useEffect(() => {
    if (!workflowHydrated) return;
    if (!authUserId) return;
    if (spaceSource === "shared" && spaceRole === "viewer") return;

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return;
    }

    const debounceMs = workflowHasPendingRun ? 250 : 1500;
    const t = window.setTimeout(() => {
      void (async () => {
        // If the initial cloud fetch failed (null ref), fetch now so we can send a
        // valid expectedUpdatedAt and avoid a false-conflict 409.
        if (lastCloudUpdatedAtRef.current === null) {
          const prefetch = await fetchCloudWorkflowSpace(resolvedSpaceId);
          if (prefetch?.updatedAt) {
            lastCloudUpdatedAtRef.current = prefetch.updatedAt;
          }
        }
        const res = await saveCloudWorkflowSpace({
          spaceId: resolvedSpaceId,
          name: spaceName,
          state: workflowProject,
          publishedCommunityTemplateId: publishedTemplateId,
          expectedUpdatedAt: lastCloudUpdatedAtRef.current,
        });
        if (res.ok) {
          if (res.updatedAt) lastCloudUpdatedAtRef.current = res.updatedAt;
          return;
        }
        if (res.status === 409) {
          // The server returns serverUpdatedAt in the 409 body; use it directly to
          // avoid an extra round-trip. Fall back to a fresh fetch only when missing.
          let resolvedUpdatedAt: string | null = res.serverUpdatedAt ?? null;
          if (!resolvedUpdatedAt) {
            const latest = await fetchCloudWorkflowSpace(resolvedSpaceId);
            resolvedUpdatedAt = latest?.updatedAt ?? null;
            // If the cloud already reflects our local state another save is not needed.
            if (
              latest &&
              workflowCloudPayloadMatchesLocal(latest, {
                name: spaceName,
                publishedCommunityTemplateId: publishedTemplateId,
                state: workflowProject,
              })
            ) {
              if (resolvedUpdatedAt) lastCloudUpdatedAtRef.current = resolvedUpdatedAt;
              return;
            }
          }
          // Retry once with the freshly-resolved expectedUpdatedAt so that
          // assistant results (and any other pending changes) are not lost.
          if (resolvedUpdatedAt) {
            lastCloudUpdatedAtRef.current = resolvedUpdatedAt;
            const retry = await saveCloudWorkflowSpace({
              spaceId: resolvedSpaceId,
              name: spaceName,
              state: workflowProject,
              publishedCommunityTemplateId: publishedTemplateId,
              expectedUpdatedAt: resolvedUpdatedAt,
            });
            if (retry.ok && retry.updatedAt) lastCloudUpdatedAtRef.current = retry.updatedAt;
          }
        }
      })();
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [
    workflowHydrated,
    authUserId,
    resolvedSpaceId,
    workflowProject,
    spaceName,
    publishedTemplateId,
    spaceSource,
    spaceRole,
    workflowHasPendingRun,
  ]);

  /**
   * Re-sync from cloud when the user returns to this tab (e.g. was editing on
   * another device). Without this, the phone page stays stale until reloaded.
   */
  useEffect(() => {
    if (!workflowHydrated || !authUserId || storageScope === null) return;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const cloud = await fetchCloudWorkflowSpace(resolvedSpaceId);
        if (!cloud) return;
        const cloudMs = Date.parse(cloud.updatedAt);
        const knownMs = lastCloudUpdatedAtRef.current ? Date.parse(lastCloudUpdatedAtRef.current) : 0;
        if (!Number.isFinite(cloudMs) || cloudMs <= knownMs) return;

        lastCloudUpdatedAtRef.current = cloud.updatedAt;
        setSpaceName(cloud.name || "Untitled workflow");
        // Merge: if the cloud is still missing publishedCommunityTemplateId (e.g. the
        // eager save from publishing raced with the visibility refetch), keep whatever
        // is currently in React state so the CTA doesn't regress to "Publish template".
        const visibilityMergedTemplateId =
          (cloud.publishedCommunityTemplateId ?? "").trim() ||
          publishedTemplateId?.trim() ||
          null;
        setPublishedTemplateId(visibilityMergedTemplateId);
        // Prevent the reactive save effects from re-saving what we just fetched.
        skipNextCloudSaveRef.current = true;
        setWorkflowProject(cloud.state);

        if (spaceSource === "local") {
          skipNextLocalSaveRef.current = true;
          saveProjectForSpace(storageScope, resolvedSpaceId, cloud.state);
          updateSpaceMeta(storageScope, resolvedSpaceId, {
            name: cloud.name || undefined,
            updatedAt: cloudMs,
            previewDataUrl: cloud.previewDataUrl ?? undefined,
            publishedCommunityTemplateId: visibilityMergedTemplateId ?? undefined,
          });
        }
      })();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [workflowHydrated, authUserId, resolvedSpaceId, spaceSource, storageScope, publishedTemplateId]);

  const workflowPreviewSavedDataUrl = useMemo(
    () => buildWorkflowPreviewDataUrl(workflowProject),
    [workflowProject],
  );

  useEffect(() => {
    if (!workflowHydrated || storageScope === null) return;
    if (spaceSource !== "local") return;
    const next = workflowPreviewSavedDataUrl;
    if (lastSavedPreviewRef.current === next) return;
    // Delay snapshot persistence so freshly generated media has time to settle
    // before we freeze the card preview shown on the workflow landing.
    const t = window.setTimeout(() => {
      updateSpaceMeta(storageScope, resolvedSpaceId, { previewDataUrl: next });
      lastSavedPreviewRef.current = next;
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [workflowHydrated, storageScope, resolvedSpaceId, workflowPreviewSavedDataUrl, spaceSource]);

  /**
   * A community template can be deleted from Admin/Templates while this workflow
   * still stores its published id. If the id is now missing, reset local meta so
   * actions switch back to "Publish template" instead of stale update/remove CTAs.
   */
  useEffect(() => {
    if (!publishedTemplateId) return;
    const templateId = publishedTemplateId.trim();
    if (!templateId || !/^[0-9a-f-]{36}$/i.test(templateId)) {
      setPublishedTemplateId(null);
      if (storageScope) {
        updateSpaceMeta(storageScope, resolvedSpaceId, { publishedCommunityTemplateId: undefined });
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workflow/community-templates/${encodeURIComponent(templateId)}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setPublishedTemplateId((prev) => (prev === templateId ? null : prev));
          if (storageScope) {
            updateSpaceMeta(storageScope, resolvedSpaceId, { publishedCommunityTemplateId: undefined });
          }
          toast.message("Template reference reset", {
            description: "This template was deleted. You can publish it again.",
          });
        }
      } catch {
        /* non-blocking: keep current UI state if validation call fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishedTemplateId, storageScope, resolvedSpaceId]);

  const showOnboarding = workflowHydrated && shouldShowWorkflowOnboarding(workflowProject);

  const finishOnboarding = useCallback((kind?: WorkflowStarterKind) => {
    setWorkflowProject((prev) => {
      const active = prev.activePageId;
      const startNode = kind ? starterNodeForKind(kind) : null;
      return {
        ...prev,
        onboardingDismissed: true,
        pages: prev.pages.map((p) =>
          p.id === active
            ? { ...p, nodes: startNode ? [startNode] : p.nodes, edges: p.edges }
            : p,
        ),
      };
    });
  }, []);

  const onPublishTemplate = useCallback(() => {
    if (publishBusy) return;
    const suggestedName = spaceName.trim() || "My workflow template";
    const suggestedBlurb = "Shared workflow template.";
    setPublishTemplateName(suggestedName);
    setPublishTemplateBlurb(suggestedBlurb);
    setPublishTemplateOpen(true);
  }, [publishBusy, spaceName]);

  const submitPublishTemplate = useCallback(async () => {
    if (publishBusy) return;
    const suggestedBlurb = "Shared workflow template.";
    const name = publishTemplateName.trim();
    const blurb = publishTemplateBlurb.trim();
    if (!name) {
      toast.error("Please enter a template name.");
      return;
    }
    setPublishBusy(true);
    try {
      // Parent `workflowProject` lags React Flow by a debounced sync; flush the live graph first.
      const flushed = canvasProjectFlushRef.current?.() ?? workflowProject;
      // Use a JSON-safe clone here too — `structuredClone` throws on any non-cloneable
      // field that may have crept into a node, which previously surfaced to the user as
      // a confusing "empty template" because the throw aborted the publish silently.
      let liveProject: WorkflowProjectStateV1;
      try {
        liveProject = structuredClone(flushed);
      } catch {
        liveProject = JSON.parse(JSON.stringify(flushed)) as WorkflowProjectStateV1;
      }
      if (!projectHasAnyNode(liveProject)) {
        toast.error("Add at least one node to your workflow before publishing.");
        return;
      }
      // Capture the best preview image URL from the live project BEFORE stripping
      // ephemeral fields, so the template card in the listing can show a thumbnail.
      const thumbnailUrl = extractWorkflowThumbnailUrl(liveProject);
      // Strip ephemeral run state and per-account media URLs so the template stays
      // small and reusable; without this the payload can exceed the 1.8MB API cap
      // and the template ends up looking empty after a failed publish.
      const projectForPublish = sanitizeProjectForCommunityTemplate(liveProject);
      const res = await fetch("/api/workflow/community-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          blurb: blurb || suggestedBlurb,
          project: projectForPublish,
          templateId: publishedTemplateId,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; template?: { id?: string } } | null;
      if (!res.ok) {
        toast.error(body?.error || "Could not publish template.");
        return;
      }
      toast.success("Template published", {
        description: "It is now visible to everyone in the Templates tab.",
      });
      setPublishTemplateOpen(false);
      const publishedId = body?.template?.id?.trim();
      if (publishedId && /^[0-9a-f-]{36}$/i.test(publishedId)) {
        setPublishedTemplateId(publishedId);
        if (storageScope) {
          updateSpaceMeta(storageScope, resolvedSpaceId, { publishedCommunityTemplateId: publishedId });
        }
        // Eagerly push publishedCommunityTemplateId to the cloud before navigating away.
        // The debounced cloud-save effect won't fire after router.push unmounts this component,
        // so without this the cloud record keeps publishedCommunityTemplateId = null and the
        // "Push modification" CTA reverts to "Publish template" on every subsequent load.
        void saveCloudWorkflowSpace({
          spaceId: resolvedSpaceId,
          name: spaceName,
          state: workflowProject,
          publishedCommunityTemplateId: publishedId,
          expectedUpdatedAt: lastCloudUpdatedAtRef.current,
        }).then((res) => {
          if (res.ok && res.updatedAt) lastCloudUpdatedAtRef.current = res.updatedAt;
        });
        router.push(`/workflow/template/${encodeURIComponent(`community:${publishedId}`)}`);
      }
    } catch {
      toast.error("Network error while publishing template.");
    } finally {
      setPublishBusy(false);
    }
  }, [
    publishBusy,
    publishTemplateName,
    publishTemplateBlurb,
    publishedTemplateId,
    router,
    spaceName,
    workflowProject,
    storageScope,
    resolvedSpaceId,
  ]);

  const removePublishedTemplate = useCallback(async () => {
    if (!publishedTemplateId || removeTemplateBusy) return;
    setRemoveTemplateBusy(true);
    try {
      const res = await fetch(`/api/workflow/community-templates/${encodeURIComponent(publishedTemplateId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error || "Could not remove template.");
        return;
      }
      setPublishedTemplateId(null);
      if (storageScope) {
        updateSpaceMeta(storageScope, resolvedSpaceId, { publishedCommunityTemplateId: undefined });
      }
      setRemoveTemplateConfirmOpen(false);
      toast.success("Removed from templates");
    } catch {
      toast.error("Network error while removing template.");
    } finally {
      setRemoveTemplateBusy(false);
    }
  }, [publishedTemplateId, removeTemplateBusy, storageScope, resolvedSpaceId]);

  const signupRedirectTarget = useMemo(
    () =>
      shareTokenTrimmed
        ? `/workflow/space/${encodeURIComponent(resolvedSpaceId)}?share=${encodeURIComponent(shareTokenTrimmed)}`
        : `/workflow/space/${encodeURIComponent(resolvedSpaceId)}`,
    [resolvedSpaceId, shareTokenTrimmed],
  );

  const workspaceReadOnly =
    workflowHydrated && spaceSource === "shared" && spaceRole === "viewer";

  const hideViewerHeaderActions = workspaceReadOnly;

  useEffect(() => {
    if (!workflowHydrated || hideViewerHeaderActions) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "s") return;
      if (shouldIgnoreWorkflowCanvasShortcuts()) return;
      e.preventDefault();
      setShareOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workflowHydrated, hideViewerHeaderActions]);

  const onDuplicateSharePreview = useCallback(() => {
    if (duplicateShareBusy) return;
    if (authUserId === null || authUserId === undefined) {
      router.push(`/signup?redirect=${encodeURIComponent(signupRedirectTarget)}`);
      return;
    }
    setDuplicateShareBusy(true);
    try {
      const flushed = canvasProjectFlushRef.current?.() ?? workflowProject;
      let liveProject: WorkflowProjectStateV1;
      try {
        liveProject = structuredClone(flushed);
      } catch {
        liveProject = JSON.parse(JSON.stringify(flushed)) as WorkflowProjectStateV1;
      }
      const scope = getWorkflowStorageScope(authUserId);
      const label = `${spaceName.trim() || "Workflow"} (copy)`;
      const meta = createSpace(scope, label);
      saveProjectForSpace(scope, meta.id, liveProject);
      toast.success("Copy created in your workflows.");
      router.push(`/workflow/space/${encodeURIComponent(meta.id)}`);
    } catch {
      toast.error("Could not duplicate this workflow.");
    } finally {
      setDuplicateShareBusy(false);
    }
  }, [
    duplicateShareBusy,
    authUserId,
    router,
    signupRedirectTarget,
    workflowProject,
    spaceName,
  ]);

  const onJoinShareWorkspace = useCallback(async () => {
    if (joinShareBusy || !shareTokenTrimmed) return;
    setJoinShareBusy(true);
    try {
      const res = await fetch("/api/workflow/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: shareTokenTrimmed }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        spaceId?: string;
        role?: string;
        invitedBy?: string;
        alreadyMember?: boolean;
      } | null;
      if (!res.ok) {
        toast.error(body?.error || "Could not join this workspace.");
        return;
      }
      if (body?.spaceId && body.role) {
        storeInviteWelcome({
          invitedBy: body.invitedBy ?? "A collaborator",
          spaceId: body.spaceId,
          role: body.role,
        });
      }
      toast.success(body?.alreadyMember ? "You already have access" : "You've joined this workspace!");
      const cloud = await fetchCloudWorkflowSpace(resolvedSpaceId);
      if (cloud) {
        lastCloudUpdatedAtRef.current = cloud.updatedAt;
        setSpaceSource(cloud.isOwn ? "local" : "shared");
        setSpaceRole(cloud.role);
        setSpaceName(cloud.name || "Untitled workflow");
        setPublishedTemplateId(cloud.publishedCommunityTemplateId ?? null);
        setWorkflowProject(cloud.state);
        setLoadedFromShareLink(false);
        skipNextCloudSaveRef.current = true;
        skipNextLocalSaveRef.current = true;
      }
    } catch {
      toast.error("Network error");
    } finally {
      setJoinShareBusy(false);
    }
  }, [joinShareBusy, shareTokenTrimmed, resolvedSpaceId]);

  return (
    <div className="relative flex min-h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#06070d] text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/12 blur-[120px]" />

      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#06070d]/95 px-4 backdrop-blur-md sm:h-14 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-white/45">
            <Link href="/workflow" className="shrink-0 text-violet-200/85 hover:text-violet-100">
              Workflow
            </Link>
            <span className="text-white/25">/</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-white/80">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-violet-400/55" aria-hidden />
              <span className="truncate">{spaceName}</span>
            </span>
            {shareTokenTrimmed && workflowHydrated && authUserId === null ? (
              <>
                <span className="text-white/25">·</span>
                <Link
                  href={`/signup?redirect=${encodeURIComponent(signupRedirectTarget)}`}
                  className="shrink-0 text-[12px] font-semibold text-violet-200/90 hover:text-violet-100"
                >
                  Sign up
                </Link>
                <span className="text-white/30">/</span>
                <Link
                  href={`/signin?redirect=${encodeURIComponent(signupRedirectTarget)}`}
                  className="shrink-0 text-[12px] font-semibold text-white/55 hover:text-white/80"
                >
                  Sign in
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hideViewerHeaderActions ? null : (
            <>
              {publishedTemplateId ? (
                <button
                  type="button"
                  onClick={() => setRemoveTemplateConfirmOpen(true)}
                  disabled={removeTemplateBusy}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border border-red-400/28 bg-red-500/12 px-3.5 text-[13px] font-semibold text-red-100 transition hover:bg-red-500/20",
                    removeTemplateBusy && "cursor-not-allowed opacity-70",
                  )}
                >
                  {removeTemplateBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {removeTemplateBusy ? "Removing…" : "Remove from templates"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onPublishTemplate}
                disabled={publishBusy}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border border-white/16 bg-white/5 px-3.5 text-[13px] font-semibold text-white/85 transition hover:bg-white/10",
                  publishBusy && "cursor-not-allowed opacity-70",
                )}
              >
                {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
                {publishBusy ? "Publishing…" : publishedTemplateId ? "Push modification" : "Publish template"}
              </button>
              <button
                type="button"
                title="Share workspace (Ctrl+Shift+S)"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            </>
          )}
        </div>
      </header>

      <ShareWorkflowDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        spaceId={resolvedSpaceId}
        spaceName={spaceName}
        ensureCloudCopy={async () => {
          const res = await saveCloudWorkflowSpace({
            spaceId: resolvedSpaceId,
            name: spaceName,
            state: workflowProject,
            publishedCommunityTemplateId: publishedTemplateId,
            expectedUpdatedAt: lastCloudUpdatedAtRef.current,
          });
          if (!res.ok) {
            return {
              ok: false,
              error:
                res.status === 401
                  ? "Sign in to share this workspace."
                  : res.status === 409
                    ? "A newer version exists in the cloud. Reload this page, then share again."
                  : res.error ||
                    "Could not sync workspace to the cloud.",
            };
          }
          if (res.updatedAt) lastCloudUpdatedAtRef.current = res.updatedAt;
          return { ok: true };
        }}
      />
      {publishTemplateOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#0b0912] p-5 shadow-2xl">
            <h2 className="text-[17px] font-semibold text-white">
              {publishedTemplateId ? "Push template modification" : "Publish template"}
            </h2>
            <p className="mt-1 text-[13px] text-white/60">
              {publishedTemplateId
                ? "Update your already published community template with current workflow changes."
                : "Share this workflow in the community Templates tab."}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-white/70">Template name</span>
                <input
                  value={publishTemplateName}
                  onChange={(e) => setPublishTemplateName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-violet-400/45"
                  placeholder="My workflow template"
                  maxLength={90}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-white/70">Short description</span>
                <textarea
                  value={publishTemplateBlurb}
                  onChange={(e) => setPublishTemplateBlurb(e.target.value)}
                  className="min-h-[84px] w-full resize-y rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-violet-400/45"
                  placeholder="Shared workflow template."
                  maxLength={260}
                />
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPublishTemplateOpen(false)}
                className="inline-flex h-9 items-center rounded-full border border-white/15 px-3 text-[12px] font-semibold text-white/80 transition hover:bg-white/10"
                disabled={publishBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitPublishTemplate()}
                disabled={publishBusy}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[12px] font-semibold text-zinc-900 transition hover:bg-white/95",
                  publishBusy && "cursor-not-allowed opacity-70",
                )}
              >
                {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {publishBusy ? "Publishing…" : publishedTemplateId ? "Push modification" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {removeTemplateConfirmOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0b0912] p-5 shadow-2xl">
            <h2 className="text-[17px] font-semibold text-white">Remove from templates?</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/62">
              This removes this published template from the Templates tab. Your current workflow remains unchanged.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTemplateConfirmOpen(false)}
                className="inline-flex h-9 items-center rounded-full border border-white/15 px-3 text-[12px] font-semibold text-white/80 transition hover:bg-white/10"
                disabled={removeTemplateBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removePublishedTemplate()}
                disabled={removeTemplateBusy}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border border-red-400/30 bg-red-500/18 px-3.5 text-[12px] font-semibold text-red-100 transition hover:bg-red-500/28",
                  removeTemplateBusy && "cursor-not-allowed opacity-70",
                )}
              >
                {removeTemplateBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {removeTemplateBusy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <WorkflowInviteWelcome spaceId={resolvedSpaceId} />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#06070d]">
          {runHistory.length > 0 ? (
            <div className="group pointer-events-auto absolute right-3 top-3 z-30 w-[min(250px,calc(100%-1.5rem))] rounded-xl border border-white/12 bg-[#0b0912]/90 p-2 shadow-2xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Run history</p>
                <button
                  type="button"
                  onClick={() => {
                    setRunHistory([]);
                    try {
                      localStorage.removeItem(runHistoryStorageKey);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/10 hover:text-white/80"
                >
                  Clear
                </button>
              </div>
              <div className="relative">
                <div className="rounded-md border border-white/8 bg-black/20 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        runHistory[0]?.level === "error"
                          ? "bg-red-400/90"
                          : runHistory[0]?.level === "success"
                            ? "bg-emerald-400/90"
                            : "bg-amber-300/90",
                      )}
                    />
                    <span className="text-[10px] font-medium text-white/70">
                      {runHistory[0]?.nodeLabel?.trim() || "Workflow"}
                    </span>
                    <span className="text-[9px] text-white/35">
                      {new Date(runHistory[0]?.ts ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/82">{runHistory[0]?.message}</p>
                </div>

                <div className="pointer-events-none absolute inset-x-0 top-[3.2rem] h-6 bg-gradient-to-b from-[#0b0912]/95 to-transparent group-hover:opacity-0" />

                <div className="mt-1.5 max-h-0 space-y-1 overflow-y-auto pr-1 opacity-0 transition-all duration-200 group-hover:max-h-44 group-hover:opacity-100">
                  {runHistory.slice(1).map((e, idx) => (
                    <div key={`${e.ts}-${idx + 1}`} className="rounded-md border border-white/8 bg-black/20 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            e.level === "error" ? "bg-red-400/90" : e.level === "success" ? "bg-emerald-400/90" : "bg-amber-300/90",
                          )}
                        />
                        <span className="text-[10px] font-medium text-white/70">
                          {e.nodeLabel?.trim() || "Workflow"}
                        </span>
                        <span className="text-[9px] text-white/35">
                          {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{e.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <div className="relative flex h-full min-h-[480px] min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {workflowHydrated && !showOnboarding ? (
                <ReactFlowProvider>
                  <WorkflowFlowWorkspace
                    project={workflowProject}
                    setProject={setWorkflowProject}
                    readOnly={workspaceReadOnly}
                    onRunLog={appendRunHistory}
                    canvasProjectFlushRef={canvasProjectFlushRef}
                    onCanvasPersist={persistCanvasNow}
                    showSharePreviewCta={loadedFromShareLink}
                    sharePreviewDuplicateLabel={
                      authUserId ? "Duplicate to my workflows" : "Sign up to duplicate"
                    }
                    onDuplicateSharePreview={onDuplicateSharePreview}
                    duplicateSharePreviewBusy={duplicateShareBusy}
                    sharePreviewJoinLabel={authUserId ? "Join workspace" : undefined}
                    onJoinShareWorkspace={authUserId ? onJoinShareWorkspace : undefined}
                    joinShareWorkspaceBusy={joinShareBusy}
                  />
                </ReactFlowProvider>
              ) : (
                <div className="h-full min-h-[400px] w-full" aria-hidden />
              )}
            </div>
          </div>
        </div>
        {showOnboarding ? (
          <WorkflowOnboarding
            onChoose={(k) => finishOnboarding(k)}
            onSkip={() => finishOnboarding()}
          />
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowTemplatePreview({ templateId }: { templateId: string }) {
  const router = useRouter();
  const sb = useSupabaseBrowserClient();
  const resolvedId = useMemo(() => normalizeWorkflowSpaceId(templateId), [templateId]);
  const [storageScope, setStorageScope] = useState<string | null>(null);
  const [project, setProject] = useState<WorkflowProjectStateV1>(() => defaultWorkflowProject());
  /**
   * `WorkflowFlowWorkspace` initializes React Flow's nodes/edges from the
   * project's active page exactly once on mount; later prop updates do NOT
   * propagate unless the active page id changes. Both `defaultWorkflowProject`
   * and any space created by `createSpace` share the same `activePageId`
   * (`workflow-page-default`), so when the fetched template arrives the page
   * sync effect skips and the canvas stays empty.
   *
   * Gate the workspace mount on `projectReady` so React Flow always boots with
   * the real fetched/built project, never the placeholder default.
   */
  const [projectReady, setProjectReady] = useState(false);
  const [communityLabel, setCommunityLabel] = useState<string | null>(null);
  const [communityAuthor, setCommunityAuthor] = useState<string | null>(null);
  const [useBusy, setUseBusy] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- template preview bootstraps scope + project when deps change */
  useEffect(() => {
    if (!sb) {
      setStorageScope(getWorkflowStorageScope(null));
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      setStorageScope(getWorkflowStorageScope(data.session?.user?.id ?? null));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setStorageScope(getWorkflowStorageScope(session?.user?.id ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (storageScope === null) return;
    setProjectReady(false);
    const communityUuid = parseWorkflowCommunityTemplateUuid(resolvedId);
    if (!communityUuid) {
      setCommunityLabel(null);
      setCommunityAuthor(null);
      const p = buildTemplateProject(resolvedId, storageScope);
      if (!p) {
        router.replace("/workflow");
        return;
      }
      setProject(p);
      setProjectReady(true);
      return;
    }

    let cancelled = false;
    setCommunityLabel(null);
    setCommunityAuthor(null);
    (async () => {
      const res = await fetch(`/api/workflow/community-templates/${communityUuid}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (!res.ok) {
        router.replace("/workflow");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        template?: { name?: unknown; project?: WorkflowProjectStateV1; created_by_name?: unknown };
      } | null;
      const t = body?.template;
      if (!t?.project || t.project.v !== 1 || !Array.isArray(t.project.pages)) {
        router.replace("/workflow");
        return;
      }
      const nm = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Template";
      if (!cancelled) {
        setCommunityLabel(nm);
        setCommunityAuthor(
          typeof t.created_by_name === "string" && t.created_by_name.trim() ? t.created_by_name.trim() : null,
        );
        setProject(t.project);
        setProjectReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedId, router, storageScope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const templateMeta = getWorkflowTemplateMeta(resolvedId, storageScope);
  const title = communityLabel ?? templateMeta?.name ?? "Template";

  const onUseTemplate = useCallback(() => {
    if (storageScope === null) {
      toast.error("Still loading your session. Try again in a moment.");
      return;
    }
    setUseBusy(true);
    const communityUuid = parseWorkflowCommunityTemplateUuid(resolvedId);
    const meta =
      communityUuid != null
        ? createSpaceFromTemplate(storageScope, resolvedId, {
            preloadedProject: project,
            templateLabel: communityLabel ?? title,
          })
        : createSpaceFromTemplate(storageScope, resolvedId);
    if (!meta) {
      toast.error("Could not create a workflow from this template.");
      setUseBusy(false);
      return;
    }
    router.push(`/workflow/space/${encodeURIComponent(meta.id)}`);
  }, [communityLabel, project, resolvedId, router, storageScope, title]);

  return (
    <div className="relative flex min-h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#06070d] text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/12 blur-[120px]" />

      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#06070d]/95 px-4 backdrop-blur-md sm:h-14 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-white/45">
            <Link href="/workflow" className="shrink-0 text-violet-200/85 hover:text-violet-100">
              Workflow
            </Link>
            <span className="text-white/25">/</span>
            <span className="text-white/40">Templates</span>
            <span className="text-white/25">/</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-white/80">
              <Eye className="h-3.5 w-3.5 shrink-0 text-white/45" strokeWidth={2} aria-hidden />
              <span className="truncate">{title}</span>
            </span>
            {communityAuthor ? <span className="truncate text-white/35">by {communityAuthor}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#06070d]">
          <div className="relative flex h-full min-h-[480px] min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {projectReady ? (
                <ReactFlowProvider key={resolvedId}>
                  <WorkflowFlowWorkspace
                    project={project}
                    setProject={setProject}
                    readOnly
                    showTemplateUseCta
                    onUseTemplate={onUseTemplate}
                    useTemplateBusy={useBusy}
                  />
                </ReactFlowProvider>
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-white/40">
                  Loading template…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 text-[10px] text-violet-200/30">
        View only, use the banner to copy this template into your workspace
      </p>
    </div>
  );
}
