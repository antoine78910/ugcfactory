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
  type DragEvent,
} from "react";

import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { AdAssetNode, type AdAssetNodeData } from "./nodes/AdAssetNode";
import { ImageRefNode, type ImageRefNodeType } from "./nodes/ImageRefNode";
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
import { WorkflowOnboarding, starterNodeForKind, type WorkflowStarterKind } from "./WorkflowOnboarding";
import {
  defaultWorkflowProject,
  migrateImageGeneratorOutEdgesToGenerated,
  newPage,
  shouldShowWorkflowOnboarding,
  type WorkflowProjectStateV1,
} from "./workflowProjectStorage";
import {
  createSpaceFromTemplate,
  getWorkflowStorageScope,
  loadProjectForSpace,
  loadSpacesIndex,
  saveProjectForSpace,
} from "./workflowSpacesStorage";
import { buildTemplateProject, getWorkflowTemplateMeta } from "./workflowTemplates";
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
  measureImageAspectFromObjectUrl,
  measureImageAspectFromUrlSafe,
  measureVideoAspectFromObjectUrl,
} from "./workflowMediaAspect";
import type { StickyNoteNodeData } from "./workflowStickyNoteTypes";
import { estimateWorkflowAdAssetRunCredits } from "./workflowNodeRun";

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
  intent?: "text-input" | "image-input" | "text-or-image" | "generic";
};

type WorkflowInputBubblePreviewState =
  | {
      targetNodeId: string;
      targetHandleId: "text" | "references" | "startImage" | "endImage";
      kind: "text" | "image";
      screenX: number;
      screenY: number;
      flowX: number;
      flowY: number;
    }
  | null;

type WorkflowOpenInputPickerDetail = {
  targetNodeId: string;
  targetHandleId: "text" | "references" | "startImage" | "endImage";
  screenX: number;
  screenY: number;
  forceIntent?: "text-or-image";
  usePointerFlow?: boolean;
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

const WORKFLOW_AD_ASSET_DRAG_KINDS: WorkflowDragNodeKind[] = [
  "image",
  "video",
  "variation",
  "assistant",
  "upscale",
  "website",
];

function isWorkflowAdAssetDragKind(raw: string): raw is WorkflowDragNodeKind {
  return WORKFLOW_AD_ASSET_DRAG_KINDS.includes(raw as WorkflowDragNodeKind);
}

function isRunnableWorkflowAdAssetKind(kind: AdAssetNodeData["kind"]): boolean {
  return kind === "image" || kind === "video" || kind === "assistant" || kind === "website";
}

type WorkflowConnectionDataKind = "text" | "image" | "video" | "media";

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
    const d = node.data as any;
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
    if (d.kind === "video") return "video";
    if (d.kind === "image" || d.kind === "variation" || d.kind === "upscale") return "image";
    return null;
  }
  return null;
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
  if (node.type === "adAsset" && h === "in") return "text";
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
    const kind = (newNode.data as AdAssetNodeData).kind;
    if (kind === "image") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "references";
      return null;
    }
    if (kind === "video") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "startImage";
      return null;
    }
    if (kind === "assistant") {
      if (sourceKind === "text") return "text";
      if (sourceKind === "image") return "references";
      return null;
    }
    return sourceKind === "text" ? "in" : null;
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

function WorkflowAddPaletteRow({
  icon: Icon,
  label,
  iconShellClass,
  onClick,
  draggable,
  onDragStart,
}: {
  icon: LucideIcon;
  label: string;
  iconShellClass: string;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable={Boolean(draggable)}
      onDragStart={onDragStart}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.06]"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
          iconShellClass,
        )}
      >
        <Icon className="h-4 w-4 text-white" strokeWidth={2} />
      </span>
      <span className="text-[13px] font-medium text-white/90">{label}</span>
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

function ZoomLabel() {
  const zoom = useStore((s) => Math.round(s.transform[2] * 100));
  return <span className="tabular-nums">{zoom}%</span>;
}

type FlowWorkspaceProps = {
  project: WorkflowProjectStateV1;
  setProject: React.Dispatch<React.SetStateAction<WorkflowProjectStateV1>>;
  readOnly?: boolean;
  /** When read-only template preview: bottom bar to duplicate into a workflow */
  showTemplateUseCta?: boolean;
  onUseTemplate?: () => void;
  useTemplateBusy?: boolean;
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

function FitViewOnPageChange({ activePageId }: { activePageId: string }) {
  const { fitView } = useReactFlow();
  const prev = useRef(activePageId);
  useEffect(() => {
    if (prev.current === activePageId) return;
    prev.current = activePageId;
    const timer = window.setTimeout(() => {
      try {
        void fitView({ padding: 0.2, duration: 200 });
      } catch {
        /* ignore */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activePageId, fitView]);
  return null;
}

type ChromeProps = {
  tool: Tool;
  setTool: (t: Tool) => void;
  addOpen: boolean;
  setAddOpen: (v: boolean | ((b: boolean) => boolean)) => void;
  setNodes: React.Dispatch<React.SetStateAction<WorkflowCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
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
  readOnly?: boolean;
};

function WorkflowReactFlowChrome({
  tool,
  setTool,
  addOpen,
  setAddOpen,
  setNodes,
  setEdges,
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
  readOnly,
}: ChromeProps) {
  const pathname = usePathname();
  const barIcon = "h-[18px] w-[18px] shrink-0";
  const { screenToFlowPosition, flowToScreenPosition, getNodesBounds, getInternalNode, getNodes } = useReactFlow();
  const viewport = useStore((s) => s.transform);

  const [groupNameDraft, setGroupNameDraft] = useState("Group");
  const [groupColorDraft, setGroupColorDraft] = useState<string>(GROUP_COLOR_PRESETS[0].value);

  const eligibleForGroup = useMemo(
    () => selectedNodes.filter((n): n is WorkflowCanvasNode => n.type !== "workflowGroup" && !n.parentId),
    [selectedNodes],
  );
  const canGroup = eligibleForGroup.length >= 2;
  const canClone = useMemo(() => canCloneWorkflowSelection(selectedNodes), [selectedNodes]);

  const groupPreviewColor = /^#[0-9A-Fa-f]{6}$/.test(groupColorDraft)
    ? groupColorDraft
    : GROUP_COLOR_PRESETS[0].value;
  const groupPreviewLabel = groupNameDraft.trim() || "Group";

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
    const ESTIMATED_PANEL_H = 320;

    const { left, screenTopY, screenBottomY } = groupSelectionAnchor;
    const roomAbove = screenTopY - MIN_TOP_SAFE;
    const placeAbove = roomAbove >= Math.min(ESTIMATED_PANEL_H, 200) + GAP;

    const top = placeAbove ? screenTopY - GAP : screenBottomY + GAP;
    const transform = placeAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)";

    return { left, top, transform };
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

  const createGroup = useCallback(() => {
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
    const name = groupNameDraft.trim() || "Group";
    const color = groupColorDraft;

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
    groupNameDraft,
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

  const [addPlusTab, setAddPlusTab] = useState<"basics" | "upload">("basics");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<"feedback" | "feature" | "bug">("feedback");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = useCallback(async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      toast.error("Please add your message.");
      return;
    }
    setFeedbackSending(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: feedbackCategory,
          message,
          pagePath: pathname || "/workflow",
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setFeedbackMessage("");
      setFeedbackCategory("feedback");
      setFeedbackOpen(false);
      toast.success("Feedback sent. Thank you!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send feedback.");
    } finally {
      setFeedbackSending(false);
    }
  }, [feedbackCategory, feedbackMessage, pathname]);
  useEffect(() => {
    const onOpen = (
      ev: Event,
    ) => {
      const detail = (ev as CustomEvent<{
        pendingConnect?: { targetNodeId: string; targetHandleId: string; flow: XYPosition };
      }>).detail;
      pendingImageRefConnectRef.current = detail?.pendingConnect ?? null;
      setPendingImageRefConnect(detail?.pendingConnect ?? null);
      uploadInputRef.current?.click();
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
  const [pendingImageRefConnect, setPendingImageRefConnect] = useState<{
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

  const onUploadFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const pendingConnect = pendingImageRefConnectRef.current;
      if (!file) {
        updatePendingImageRefConnect(null);
        return;
      }
      const isVideo = file.type.startsWith("video/");
      const objectUrl = URL.createObjectURL(file);
      let tempNodeId: string | null = null;
      void (async () => {
        try {
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
          setNodes((prev) => [...prev, tempNode]);
          if (pendingConnect) {
            setEdges((eds) =>
              addEdge(
                {
                  id: `e-${tempNode.id}-${pendingConnect.targetNodeId}-${crypto.randomUUID().slice(0, 8)}`,
                  source: tempNode.id,
                  sourceHandle: "out",
                  target: pendingConnect.targetNodeId,
                  targetHandle: pendingConnect.targetHandleId,
                  style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
                },
                eds,
              ),
            );
            updatePendingImageRefConnect(null);
          }
          setAddOpen(false);
          setFrameOpen(false);

          const hostedUrl = await uploadFileToCdn(file, { kind: isVideo ? "video" : "image" });
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== tempNode.id || n.type !== "imageRef") return n;
              const updatedNode: ImageRefNodeType = {
                ...n,
                data: {
                  ...n.data,
                  imageUrl: hostedUrl,
                  label: baseName,
                  source: "upload",
                  mediaKind: isVideo ? "video" : "image",
                  intrinsicAspect: ar,
                },
              };
              return updatedNode;
            }),
          );
          toast.success("Node added");
          URL.revokeObjectURL(objectUrl);
        } catch {
          updatePendingImageRefConnect(null);
          if (tempNodeId) {
            setNodes((prev) => prev.filter((n) => n.id !== tempNodeId));
            setEdges((eds) => eds.filter((e2) => e2.source !== tempNodeId && e2.target !== tempNodeId));
          }
          URL.revokeObjectURL(objectUrl);
          toast.error("Could not read file", { description: "Try another image or video." });
        }
      })();
    },
    [screenToFlowPosition, setEdges, setNodes, setAddOpen, setFrameOpen, updatePendingImageRefConnect],
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
        setNodes((prev) => [...prev, nextNode]);
        if (pendingConnect) {
          setEdges((eds) =>
            addEdge(
              {
                id: `e-${nextNode.id}-${pendingConnect.targetNodeId}-${crypto.randomUUID().slice(0, 8)}`,
                source: nextNode.id,
                sourceHandle: "out",
                target: pendingConnect.targetNodeId,
                targetHandle: pendingConnect.targetHandleId,
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              },
              eds,
            ),
          );
          updatePendingImageRefConnect(null);
        }
        setAddOpen(false);
        setFrameOpen(false);
        toast.success("Node added");
      })();
    },
    [screenToFlowPosition, setEdges, setNodes, setAddOpen, setFrameOpen, updatePendingImageRefConnect],
  );

  const setDragPayload = useCallback((e: DragEvent, payload: string) => {
    e.dataTransfer.setData(WORKFLOW_NODE_DND, payload);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

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
              title="Add node"
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
                      icon={Globe2}
                      label="Website"
                      iconShellClass="border-cyan-500/45 bg-cyan-950/80"
                      draggable
                      onDragStart={(e) => {
                        setDragPayload(e, "website");
                        setAddOpen(false);
                        setFrameOpen(false);
                      }}
                      onClick={() => addNode("website")}
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
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={onUploadFileChange}
                    />
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
            title="Select, drag on empty canvas to box-select; Ctrl/Cmd+click to add to selection"
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
            title="Pan"
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
            title={readOnly ? "Cut tool (view only)" : tool === "cutTarget" ? "Cut tool active" : "Cut tool"}
            disabled={readOnly}
            onClick={() => {
              if (readOnly) return;
              setAddOpen(false);
              setFrameOpen(false);
              setTool(tool === "cutTarget" ? "select" : "cutTarget");
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
                ? "Duplicate selection, group, generator, prompt text, or canvas note"
                : "Select a group, generator, prompt text, or canvas note to duplicate"
            }
            disabled={!canClone}
            onClick={() => {
              if (!canClone) return;
              setAddOpen(false);
              setFrameOpen(false);
              if (tool === "cutTarget") setTool("select");
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
                ? "Canvas note tool, click to place (Esc to cancel)"
                : "Canvas note, click the canvas to place a note"
            }
            onClick={() => {
              setTool(tool === "stickyPlace" ? "select" : "stickyPlace");
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
                disabled={feedbackSending}
                className="inline-flex items-center rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {feedbackSending ? "Sending..." : "Send feedback"}
              </button>
            </div>
          </div>
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
          aria-label="Group selection"
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
                    style={{ backgroundColor: groupPreviewColor }}
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
                    ? "Duplicate selection"
                    : "Select a group, a generator, a prompt text module, or a canvas note to duplicate"
                }
                disabled={!canClone}
                onClick={() => {
                  if (!canClone) return;
                  setAddOpen(false);
                  setFrameOpen(false);
                  if (tool === "cutTarget") setTool("select");
                  onCloneSelection();
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <CopyPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Remove selection"
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
                title={readOnly ? "Cut tool (view only)" : tool === "cutTarget" ? "Cut tool active" : "Cut tool"}
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  setAddOpen(false);
                  setFrameOpen(false);
                  setSelectionBarExpanded(false);
                  setTool(tool === "cutTarget" ? "select" : "cutTarget");
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
                title={canCut ? "Copy selection" : "Nothing to copy in this selection"}
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
            <button
              type="button"
              title="Group selection, click to show actions"
              onClick={() => {
                setSelectionBarExpanded(true);
                setAddOpen(false);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[#121212]/95 text-violet-300/90 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-violet-500/40 hover:bg-[#1a1a1c] hover:text-violet-200"
            >
              <SquareStack className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      ) : null}

      {frameOpen && canGroup ? (
        <div
          role="dialog"
          aria-label="New group"
          className="pointer-events-auto fixed z-[200] w-[min(100vw-24px,280px)] rounded-xl border border-white/10 bg-[#0b0912] p-3 shadow-2xl"
          style={
            newGroupPanelScreen ?? {
              left: "50%",
              top: 96,
              transform: "translateX(-50%)",
            }
          }
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">New group</p>
          <p className="mb-3 text-[11px] leading-snug text-white/45">
            Box-select nodes on the canvas (Select tool), or hold Ctrl / ⌘ while clicking to add nodes. Then name your
            group and pick a color.
          </p>
          <label className="mb-2 block">
            <span className="mb-1 block text-[10px] text-white/40">Name</span>
            <input
              value={groupNameDraft}
              onChange={(e) => setGroupNameDraft(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-violet-500/40"
              placeholder="Group name"
            />
          </label>
          <p className="mb-1.5 text-[10px] text-white/40">Color</p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
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
                  onClick={() => setGroupColorDraft(c.value)}
                />
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/55 hover:border-white/20">
              <span className="whitespace-nowrap">Custom</span>
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(groupColorDraft) ? groupColorDraft : GROUP_COLOR_PRESETS[0].value}
                onChange={(e) => setGroupColorDraft(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Custom color"
              />
            </label>
          </div>
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] text-white/40">Preview</p>
            <div
              className="overflow-hidden rounded-2xl border-2 border-dashed bg-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              style={{ borderColor: groupPreviewColor }}
              aria-hidden
            >
              <div
                className="rounded-t-[13px] border-b border-white/[0.08] px-2.5 py-2"
                style={{ backgroundColor: `${groupPreviewColor}18` }}
              >
                <span className="block truncate text-left text-[12px] font-semibold leading-tight text-white/90">
                  {groupPreviewLabel}
                </span>
              </div>
              <div className="min-h-[52px] rounded-b-[13px] bg-black/[0.12]" />
            </div>
          </div>
          <button
            type="button"
            onClick={createGroup}
            className="w-full rounded-lg bg-violet-500/90 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-500"
          >
            Create group
          </button>
        </div>
      ) : null}
    </>
  );
}

function WorkflowFlowWorkspace({
  project,
  setProject,
  readOnly = false,
  showTemplateUseCta = false,
  onUseTemplate,
  useTemplateBusy = false,
}: FlowWorkspaceProps) {
  const { screenToFlowPosition, flowToScreenPosition, getInternalNode, getNodes, getViewport } = useReactFlow();
  const activePage = useMemo(
    () => project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0],
    [project.pages, project.activePageId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>(activePage?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(activePage?.edges ?? []);
  const [alignGuides, setAlignGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const alignHoldCandidateRef = useRef<{ nodeId: string; guideX: number | null; guideY: number | null; sinceMs: number } | null>(null);
  const lastAlignTargetRef = useRef<{ nodeId: string; x: number | null; y: number | null } | null>(null);
  const [tool, setTool] = useState<Tool>(readOnly ? "pan" : "select");
  const [addOpen, setAddOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [selectionBarExpanded, setSelectionBarExpanded] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredEdgeScissors, setHoveredEdgeScissors] = useState<{ x: number; y: number } | null>(null);
  const edgeHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEdgePointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Derive from node `selected` flags, matches React Flow's controlled state (onSelectionChange can lag). */
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const [placementPicker, setPlacementPicker] = useState<WorkflowPlacementPickerState | null>(null);
  const placementRef = useRef<HTMLDivElement>(null);
  const [inputBubblePreview, setInputBubblePreview] = useState<WorkflowInputBubblePreviewState>(null);
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
  const [historyUiTick, setHistoryUiTick] = useState(0);
  const bumpHistoryUi = useCallback(() => setHistoryUiTick((n) => n + 1), []);

  useLayoutEffect(() => {
    const p = project.pages.find((x) => x.id === project.activePageId);
    if (p) lastSnapshotRef.current = cloneWorkflowCanvasSnapshot(p.nodes, p.edges);
  }, []);

  const prevActiveId = useRef(project.activePageId);

  useEffect(() => {
    if (prevActiveId.current === project.activePageId) return;
    prevActiveId.current = project.activePageId;
    const p = project.pages.find((x) => x.id === project.activePageId);
    if (p) {
      skipHistoryCommitRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      lastSnapshotRef.current = cloneWorkflowCanvasSnapshot(p.nodes, p.edges);
      setNodes(p.nodes.map((n) => ({ ...n, selected: false })));
      setEdges(migrateImageGeneratorOutEdgesToGenerated(p.nodes as WorkflowCanvasNode[], p.edges));
      setFrameOpen(false);
      setPlacementPicker(null);
      setTool("select");
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
      const raw = e.dataTransfer.getData(WORKFLOW_NODE_DND);
      if (!raw) return;
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setAddOpen(false);
      setFrameOpen(false);
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
    [readOnly, screenToFlowPosition, setEdges, setNodes],
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
        intent: detail.forceIntent ?? (detail.targetHandleId === "text" ? "text-input" : "image-input"),
      });
    };
    window.addEventListener("workflow:open-input-picker", onOpenInputPicker as EventListener);
    return () =>
      window.removeEventListener("workflow:open-input-picker", onOpenInputPicker as EventListener);
  }, [nodes, screenToFlowPosition, armPlacementPickerAgainstPaneClick]);

  useEffect(() => {
    if (readOnly) return;

    const onPreview = (ev: Event) => {
      const detail = (ev as CustomEvent<
        | { active?: boolean }
        | {
            targetNodeId: string;
            targetHandleId: "text" | "references" | "startImage" | "endImage";
            screenX: number;
            screenY: number;
          }
      >).detail;
      if (!detail) return;

      if ("active" in detail && detail.active === false) {
        setInputBubblePreview(null);
        return;
      }

      if (
        !("targetNodeId" in detail) ||
        !("targetHandleId" in detail) ||
        !("screenX" in detail) ||
        !("screenY" in detail) ||
        typeof detail.targetNodeId !== "string" ||
        typeof detail.targetHandleId !== "string" ||
        typeof detail.screenX !== "number" ||
        typeof detail.screenY !== "number"
      ) {
        return;
      }

      const flow = screenToFlowPosition({ x: detail.screenX, y: detail.screenY });
      setInputBubblePreview({
        targetNodeId: detail.targetNodeId,
        targetHandleId: detail.targetHandleId,
        kind: detail.targetHandleId === "text" ? "text" : "image",
        screenX: detail.screenX,
        screenY: detail.screenY,
        flowX: flow.x,
        flowY: flow.y,
      });
    };

    const onDrop = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        targetNodeId: string;
        targetHandleId: "text" | "references" | "startImage" | "endImage";
        screenX: number;
        screenY: number;
      }>).detail;
      if (!detail) return;

      const targetHandleId = detail.targetHandleId;
      const targetNodeId = detail.targetNodeId;
      const flow = screenToFlowPosition({ x: detail.screenX, y: detail.screenY });

      setInputBubblePreview(null);
      armPlacementPickerAgainstPaneClick();
      setPlacementPicker({
        flow,
        screenX: detail.screenX,
        screenY: detail.screenY,
        connectTo: { nodeId: targetNodeId, handleId: targetHandleId },
        intent: targetHandleId === "text" ? "text-input" : "image-input",
      });
    };

    window.addEventListener("workflow:input-bubble-preview", onPreview as EventListener);
    window.addEventListener("workflow:input-bubble-drop", onDrop as EventListener);
    return () => {
      window.removeEventListener("workflow:input-bubble-preview", onPreview as EventListener);
      window.removeEventListener("workflow:input-bubble-drop", onDrop as EventListener);
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
        const fromNode = allNodes.find((n) => n.id === from.nodeId);
        const fromKind = sourceKindFromNodeHandle(fromNode, from.handleId);
        const defaultTargetHandle = targetHandleForNewNodeFromSourceKind(newNode as WorkflowCanvasNode, fromKind);
        if (!defaultTargetHandle) {
          toast.error("Incompatible connection", {
            description: "This output type can only connect to matching input bubbles.",
          });
          setPlacementPicker(null);
          return;
        }
        setEdges((eds) =>
          addEdge(
            {
              id: `e-${from.nodeId}-${newNode.id}-${crypto.randomUUID().slice(0, 8)}`,
              source: from.nodeId,
              sourceHandle: from.handleId ?? undefined,
              target: newNode.id,
              targetHandle: defaultTargetHandle,
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
            eds,
          ),
        );
      }
      if (to && connectableTo) {
        const newAd = newNode.type === "adAsset" ? (newNode.data as AdAssetNodeData) : null;
        const outHandle = newAd?.kind === "image" ? "generated" : "out";
        setEdges((eds) =>
          addEdge(
            {
              id: `e-${newNode.id}-${to.nodeId}-${crypto.randomUUID().slice(0, 8)}`,
              source: newNode.id,
              sourceHandle: outHandle,
              target: to.nodeId,
              targetHandle: to.handleId,
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
            eds,
          ),
        );
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
    setPlacementPicker(null);
    window.dispatchEvent(new CustomEvent("workflow:open-upload-picker", { detail: { pendingConnect } }));
  }, [placementPicker]);

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

  useEffect(() => {
    const id = project.activePageId;
    const t = window.setTimeout(() => {
      setProject((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.id === id ? { ...p, nodes, edges } : p)),
      }));
    }, 200);
    return () => window.clearTimeout(t);
  }, [nodes, edges, project.activePageId, setProject]);

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
      const dstKind = targetKindFromNodeHandle(targetNode, targetHandle);
      if (!canConnectByDataKind(srcKind, dstKind)) {
        toast.error("Incompatible connection", {
          description: "This output type can only connect to a matching input type.",
        });
        return;
      }
      const handleId = targetHandle ?? "";
      let replaceSameHandle = false;
      if (targetNode?.type === "adAsset") {
        const kind = (targetNode.data as AdAssetNodeData).kind;
        if (handleId === "text" && (kind === "image" || kind === "video")) replaceSameHandle = true;
        if (handleId === "startImage" && kind === "video") replaceSameHandle = true;
        if (handleId === "endImage" && kind === "video") replaceSameHandle = true;
      }
      setEdges((eds) => {
        const base = replaceSameHandle
          ? eds.filter((e) => !(e.target === target && (e.targetHandle ?? "") === handleId))
          : eds;
        return addEdge(
          {
            ...params,
            style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
          },
          base,
        );
      });
    },
    [readOnly, setEdges, getNodes],
  );
  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (params) => {
      const { source, sourceHandle, target, targetHandle } = params;
      if (!source || !target) return false;
      const allNodes = getNodes() as WorkflowCanvasNode[];
      const sourceNode = allNodes.find((n) => n.id === source);
      const targetNode = allNodes.find((n) => n.id === target);
      const srcKind = sourceKindFromNodeHandle(sourceNode, sourceHandle);
      const dstKind = targetKindFromNodeHandle(targetNode, targetHandle);
      return canConnectByDataKind(srcKind, dstKind);
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
        setEdges((eds) => {
          if (eds.some((e) => e.source === pair.source && e.target === pair.target)) return eds;
          const srcNode = all.find((n) => n.id === pair.source);
          const srcHandle =
            srcNode?.type === "adAsset" && (srcNode.data as AdAssetNodeData).kind === "image"
              ? "generated"
              : "out";
          return addEdge(
            {
              id: `e-${pair.source}-${pair.target}-${crypto.randomUUID().slice(0, 8)}`,
              source: pair.source,
              sourceHandle: srcHandle,
              target: pair.target,
              targetHandle: "in",
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
            eds,
          );
        });
      };
      requestAnimationFrame(() => requestAnimationFrame(tryLink));
    },
    [readOnly, getInternalNode, getNodes, setEdges, setAlignGuides],
  );

  const onNodeDrag = useCallback(
    (_event: unknown, node: WorkflowCanvasNode) => {
      if (readOnly) return;
      if (node.type === "workflowGroup") return;
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

      const now = Date.now();
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
        alignHoldCandidateRef.current = { nodeId: node.id, guideX: bestX?.guide ?? null, guideY: bestY?.guide ?? null, sinceMs: now };
        setAlignGuides({ x: null, y: null });
        return;
      }
      if (now - hold.sinceMs < ALIGN_HOLD_MS) {
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
          PromptListNodeData
      >,
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowCanvasNode) : n,
        ),
      );
    },
    [setNodes],
  );

  const cloneSelection = useCallback(() => {
    const res = cloneWorkflowSelection(nodes, edges, selectedNodes);
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
  }, [nodes, edges, selectedNodes, setNodes, setEdges]);

  const canCutSelection = useMemo(
    () => !readOnly && buildWorkflowClipboardPayload(nodes, edges, selectedNodes) !== null,
    [readOnly, nodes, edges, selectedNodes],
  );

  const applyWorkflowPaste = useCallback(
    (payload: WorkflowClipboardPayloadV1) => {
      const res = remapPastedWorkflowPayload(payload);
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
      const n = getInternalNode(nodeId) as any;
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
      if (isEditableElementFocused()) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const payload = parseWorkflowClipboardText(text);
      if (!payload) return;
      e.preventDefault();
      applyWorkflowPaste(payload);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readOnly, applyWorkflowPaste]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (!e.ctrlKey && !e.metaKey) return;
      if (isEditableElementFocused()) return;
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
  }, [readOnly, nodes, edges, selectedNodes, cutSelection, onUndo, onRedo]);

  useEffect(() => {
    if (readOnly || (tool !== "stickyPlace" && tool !== "cutTarget")) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isEditableElementFocused()) return;
      setTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, tool, setTool]);

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
          minZoom={0.1}
          panOnDrag={readOnly ? true : tool === "pan"}
          selectionOnDrag={readOnly ? false : tool === "select"}
          selectionMode={SelectionMode.Partial}
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
          className={cn(
            "workflow-flow relative z-[1] !bg-transparent",
            readOnly && "workflow-template-readonly",
            !readOnly && tool === "select" && "workflow-select-mode",
            !readOnly && tool === "stickyPlace" && "workflow-sticky-place-mode",
            !readOnly && tool === "cutTarget" && "workflow-cut-target-mode",
          )}
          defaultEdgeOptions={{
            style: { stroke: "rgba(167, 139, 250, 0.42)", strokeWidth: 2 },
            ...(!readOnly && tool === "cutTarget"
              ? { interactionWidth: 44 }
              : !readOnly && tool === "select"
                ? { interactionWidth: 28 }
                : {}),
          }}
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

      {inputBubblePreview ? (
        <div
          className="pointer-events-none fixed z-[210] -translate-x-1/2 -translate-y-1/2"
          style={{
            left: Math.max(12, Math.min(inputBubblePreview.screenX, (typeof window !== "undefined" ? window.innerWidth : 1200) - 12)),
            top: Math.max(12, Math.min(inputBubblePreview.screenY, (typeof window !== "undefined" ? window.innerHeight : 800) - 12)),
          }}
          aria-hidden
        >
          {inputBubblePreview.kind === "text" ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[12px] font-bold text-white/70 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur">
              T
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[12px] font-bold text-white/70 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur">
              <ImageIconLucide className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
          )}
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
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("website")}
                >
                  Website
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
                  onClick={() => placeNodeAtPicker("assistant")}
                >
                  Assistant
                </button>
              </>
            ) : placementPicker.intent === "image-input" ? (
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

export function WorkflowEditor({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const sb = useSupabaseBrowserClient();
  const resolvedSpaceId = useMemo(() => normalizeWorkflowSpaceId(spaceId), [spaceId]);

  const [storageScope, setStorageScope] = useState<string | null>(null);
  const [workflowProject, setWorkflowProject] = useState<WorkflowProjectStateV1>(() => defaultWorkflowProject());
  const [workflowHydrated, setWorkflowHydrated] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled workflow");
  const [shareOpen, setShareOpen] = useState(false);

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
    setWorkflowHydrated(false);
    const idx = loadSpacesIndex(storageScope).spaces;
    if (!idx.some((s) => s.id === resolvedSpaceId)) {
      router.replace("/workflow");
      return;
    }
    const meta = idx.find((s) => s.id === resolvedSpaceId);
    if (meta) setSpaceName(meta.name);
    setWorkflowProject(loadProjectForSpace(storageScope, resolvedSpaceId));
    setWorkflowHydrated(true);
  }, [resolvedSpaceId, router, storageScope]);

  useEffect(() => {
    if (!workflowHydrated || storageScope === null) return;
    saveProjectForSpace(storageScope, resolvedSpaceId, workflowProject);
  }, [workflowHydrated, storageScope, resolvedSpaceId, workflowProject]);

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
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </header>

      <ShareWorkflowDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        spaceId={resolvedSpaceId}
        spaceName={spaceName}
      />
      <WorkflowInviteWelcome spaceId={resolvedSpaceId} />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#06070d]">
          <div className="relative flex h-full min-h-[480px] min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {workflowHydrated && !showOnboarding ? (
                <ReactFlowProvider>
                  <WorkflowFlowWorkspace project={workflowProject} setProject={setWorkflowProject} />
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
  const [project, setProject] = useState<WorkflowProjectStateV1>(
    () => buildTemplateProject(resolvedId) ?? defaultWorkflowProject(),
  );
  const [useBusy, setUseBusy] = useState(false);

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
    const p = buildTemplateProject(resolvedId, storageScope);
    if (!p) {
      router.replace("/workflow");
      return;
    }
    setProject(p);
  }, [resolvedId, router, storageScope]);

  const templateMeta = getWorkflowTemplateMeta(resolvedId, storageScope);
  const title = templateMeta?.name ?? "Template";

  const onUseTemplate = useCallback(() => {
    if (storageScope === null) {
      toast.error("Still loading your session. Try again in a moment.");
      return;
    }
    setUseBusy(true);
    const meta = createSpaceFromTemplate(storageScope, resolvedId);
    if (!meta) {
      toast.error("Could not create a workflow from this template.");
      setUseBusy(false);
      return;
    }
    router.push(`/workflow/space/${encodeURIComponent(meta.id)}`);
  }, [resolvedId, router, storageScope]);

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
              <ReactFlowProvider>
                <WorkflowFlowWorkspace
                  project={project}
                  setProject={setProject}
                  readOnly
                  showTemplateUseCta
                  onUseTemplate={onUseTemplate}
                  useTemplateBusy={useBusy}
                />
              </ReactFlowProvider>
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
