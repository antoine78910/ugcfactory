"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type XYPosition,
} from "@xyflow/react";
import {
  ChevronDown,
  GripVertical,
  Hand,
  Infinity,
  Layers,
  MessageSquare,
  MousePointer2,
  Plus,
  Redo2,
  Scissors,
  Settings,
  Share2,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { AdAssetNode, type AdAssetNodeData, type AdAssetNodeType } from "./nodes/AdAssetNode";
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
  newPage,
  shouldShowWorkflowOnboarding,
  type WorkflowProjectStateV1,
} from "./workflowProjectStorage";
import { loadProjectForSpace, loadSpacesIndex, saveProjectForSpace } from "./workflowSpacesStorage";
import { WorkflowNodePatchProvider } from "./workflowNodePatchContext";
import { WorkflowAmbientLayer } from "./WorkflowAmbientLayer";
import {
  buildAdAssetNode,
  WORKFLOW_NODE_DND,
  type WorkflowDragNodeKind,
} from "./workflowNodeFactory";

const nodeTypes = { adAsset: AdAssetNode, workflowGroup: WorkflowGroupNode };

type Tool = "select" | "pan";

function ZoomLabel() {
  const zoom = useStore((s) => Math.round(s.transform[2] * 100));
  return <span className="tabular-nums">{zoom}%</span>;
}

type FlowWorkspaceProps = {
  project: WorkflowProjectStateV1;
  setProject: React.Dispatch<React.SetStateAction<WorkflowProjectStateV1>>;
  canvasWaveKey: number;
};

function WorkflowPagesPanel({
  project,
  setProject,
  onSelectPage,
  onAddPage,
  nodesEdgesRef,
}: {
  project: WorkflowProjectStateV1;
  setProject: React.Dispatch<React.SetStateAction<WorkflowProjectStateV1>>;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  nodesEdgesRef: React.MutableRefObject<{ nodes: WorkflowCanvasNode[]; edges: Edge[] } | null>;
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
    <div className="pointer-events-auto absolute right-4 top-4 z-30 w-[min(100%,220px)] sm:right-5 sm:top-5">
      <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0b0912]/95 shadow-[0_12px_48px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
          <span className="text-[13px] font-bold text-white">Pages</span>
          <button
            type="button"
            onClick={onAddPage}
            className="text-[12px] font-semibold text-white/90 transition hover:text-violet-200"
          >
            + New
          </button>
        </div>
        <ul className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto p-2">
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
                    className="w-full rounded-xl border border-violet-500/35 bg-black/40 px-3 py-2 text-center text-[13px] font-semibold text-white outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectPage(p.id)}
                      onDoubleClick={() => beginRename(p.id, p.name)}
                      className={cn(
                        "min-w-0 flex-1 rounded-xl px-3 py-2 text-center text-[13px] font-semibold transition",
                        active
                          ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-white/55 hover:bg-white/[0.05] hover:text-white/85",
                      )}
                    >
                      <span className="block truncate">{p.name}</span>
                    </button>
                    {project.pages.length > 1 ? (
                      <button
                        type="button"
                        title="Delete page"
                        onClick={() => deletePage(p.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/25 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-2 px-1 text-[9px] text-white/30">Double-click a page name to rename.</p>
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
  activePageId: string;
  activeName: string;
  selectedNodes: WorkflowCanvasNode[];
  frameOpen: boolean;
  setFrameOpen: (v: boolean | ((b: boolean) => boolean)) => void;
};

function WorkflowReactFlowChrome({
  tool,
  setTool,
  addOpen,
  setAddOpen,
  setNodes,
  activePageId,
  activeName,
  selectedNodes,
  frameOpen,
  setFrameOpen,
}: ChromeProps) {
  const { screenToFlowPosition, getNodesBounds, getInternalNode } = useReactFlow();
  const [groupNameDraft, setGroupNameDraft] = useState("Group");
  const [groupColorDraft, setGroupColorDraft] = useState<string>(GROUP_COLOR_PRESETS[0].value);

  const eligibleForGroup = useMemo(
    () => selectedNodes.filter((n): n is AdAssetNodeType => n.type === "adAsset" && !n.parentId),
    [selectedNodes],
  );
  const canGroup = eligibleForGroup.length >= 2;

  const createGroup = useCallback(() => {
    if (!canGroup) {
      toast.error("Select at least two top-level nodes to group.");
      return;
    }
    const HEADER = 40;
    const PAD = 24;
    const bounds = getNodesBounds(eligibleForGroup);
    const gx = bounds.x - PAD;
    const gy = bounds.y - PAD - HEADER;
    const gw = Math.max(bounds.width + 2 * PAD, 200);
    const gh = Math.max(bounds.height + 2 * PAD + HEADER, 160);
    const groupId = crypto.randomUUID();
    const name = groupNameDraft.trim() || "Group";
    const color = groupColorDraft;

    const childUpdates = eligibleForGroup.map((n) => {
      const internal = getInternalNode(n.id);
      const abs = internal?.internals.positionAbsolute ?? { x: n.position.x, y: n.position.y };
      return { node: n, abs };
    });

    setNodes((prev) => {
      const selectedIds = new Set(eligibleForGroup.map((n) => n.id));
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
    toast.success("Group created");
  }, [
    canGroup,
    eligibleForGroup,
    getInternalNode,
    getNodesBounds,
    groupColorDraft,
    groupNameDraft,
    setNodes,
  ]);

  const addNode = useCallback(
    (kind: AdAssetNodeType["data"]["kind"]) => {
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

  const setDragPayload = useCallback((e: DragEvent, payload: string) => {
    e.dataTransfer.setData(WORKFLOW_NODE_DND, payload);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const barIcon = "h-[18px] w-[18px] shrink-0";

  return (
    <>
      <FitViewOnPageChange activePageId={activePageId} />
      <Background
        id="workflow-lab-dots"
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.15}
        color="rgba(196, 181, 253, 0.2)"
      />

      <Panel position="top-left" className="!m-0 !mt-5 !ml-4 z-10 flex !w-auto">
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
                setAddOpen((o) => !o);
                setFrameOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]"
            >
              <Plus className={barIcon} strokeWidth={2.25} />
            </button>
            {addOpen ? (
              <div className="absolute left-[calc(100%+10px)] top-0 z-20 min-w-[200px] rounded-xl border border-white/10 bg-[#0b0912] py-1 shadow-xl">
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragPayload(e, "pick");
                    setAddOpen(false);
                    setFrameOpen(false);
                  }}
                  className="flex cursor-grab items-center gap-2 border-b border-white/[0.08] px-3 py-2.5 text-[12px] text-white/65 active:cursor-grabbing"
                  title="Drop on the canvas to choose node type"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-white/35" aria-hidden />
                  <span>Drag to canvas — pick type on drop</span>
                </div>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragPayload(e, "image");
                    setAddOpen(false);
                    setFrameOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white/85 hover:bg-white/[0.06]"
                  onClick={() => addNode("image")}
                >
                  Image node
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragPayload(e, "video");
                    setAddOpen(false);
                    setFrameOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white/85 hover:bg-white/[0.06]"
                  onClick={() => addNode("video")}
                >
                  Video node
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragPayload(e, "variation");
                    setAddOpen(false);
                    setFrameOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white/85 hover:bg-white/[0.06]"
                  onClick={() => addNode("variation")}
                >
                  Variation node
                </button>
              </div>
            ) : null}
          </div>

          <div className="my-0.5 h-px w-7 bg-white/[0.12]" aria-hidden />

          <button
            type="button"
            title="Select"
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
            title="Cut (coming soon)"
            disabled
            className="relative flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/75 opacity-90"
          >
            <Scissors className={barIcon} strokeWidth={2} />
            <ChevronDown
              className="pointer-events-none absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-white/55"
              strokeWidth={3}
              aria-hidden
            />
          </button>
          <div className="relative flex w-full flex-col items-center">
            <button
              type="button"
              title={
                canGroup
                  ? "Group selection — name and color"
                  : "Select two or more nodes (marquee) to group"
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
              <Square className={barIcon} strokeWidth={2} />
              <ChevronDown
                className="pointer-events-none absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-white/55"
                strokeWidth={3}
                aria-hidden
              />
            </button>
            {frameOpen && canGroup ? (
              <div className="absolute left-[calc(100%+10px)] top-0 z-20 w-[220px] rounded-xl border border-white/10 bg-[#0b0912] p-3 shadow-xl">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">New group</p>
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
                <div className="mb-3 flex flex-wrap gap-1.5">
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
                <button
                  type="button"
                  onClick={createGroup}
                  className="w-full rounded-lg bg-violet-500/90 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-500"
                >
                  Create group
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            title="Note (coming soon)"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/75 opacity-90"
          >
            <MessageSquare className={barIcon} strokeWidth={2} />
          </button>

          <div className="my-0.5 h-px w-7 bg-white/[0.12]" aria-hidden />

          <button
            type="button"
            title="Undo (coming soon)"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/80"
          >
            <Undo2 className={barIcon} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Redo (coming soon)"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/30"
          >
            <Redo2 className={barIcon} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Settings (coming soon)"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/80"
          >
            <Settings className={barIcon} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Flow options (coming soon)"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-white/85"
          >
            <Infinity className={barIcon} strokeWidth={2} />
          </button>
        </div>
      </Panel>

      <Panel position="bottom-center" className="!m-0 !mb-4 flex !flex-col !items-center gap-2 !w-auto">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#0b0912]/95 px-4 py-2 text-[13px] font-semibold text-white shadow-lg backdrop-blur-md transition hover:border-white/20 hover:bg-[#0b0912]"
        >
          <Layers className="h-4 w-4 text-white/70" aria-hidden />
          {activeName}
        </button>
        <div className="flex items-center gap-3 rounded-full border border-violet-500/25 bg-[#06070d]/95 px-4 py-2 text-[12px] text-white/50 shadow-lg backdrop-blur-md">
          <button type="button" className="text-white/40 hover:text-white/65">
            Give feedback
          </button>
          <span className="text-white/25">|</span>
          <button type="button" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
            <ZoomLabel />
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>
      </Panel>
    </>
  );
}

function WorkflowFlowWorkspace({ project, setProject, canvasWaveKey }: FlowWorkspaceProps) {
  const { screenToFlowPosition } = useReactFlow();
  const activePage = useMemo(
    () => project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0],
    [project.pages, project.activePageId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>(activePage?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(activePage?.edges ?? []);
  const [tool, setTool] = useState<Tool>("select");
  const [addOpen, setAddOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<WorkflowCanvasNode[]>([]);
  const [placementPicker, setPlacementPicker] = useState<null | { flow: XYPosition; screenX: number; screenY: number }>(
    null,
  );
  const placementRef = useRef<HTMLDivElement>(null);

  const nodesEdgesRef = useRef<{ nodes: WorkflowCanvasNode[]; edges: Edge[] } | null>(null);
  nodesEdgesRef.current = { nodes, edges };

  const prevActiveId = useRef(project.activePageId);

  useEffect(() => {
    if (prevActiveId.current === project.activePageId) return;
    prevActiveId.current = project.activePageId;
    const p = project.pages.find((x) => x.id === project.activePageId);
    if (p) {
      setNodes(p.nodes);
      setEdges(p.edges);
      setSelectedNodes([]);
      setFrameOpen(false);
      setPlacementPicker(null);
    }
  }, [project.activePageId, project.pages, setNodes, setEdges]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
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
      if (raw === "image" || raw === "video" || raw === "variation") {
        setNodes((prev) => [...prev, buildAdAssetNode(raw, flowPos)]);
        toast.success("Node added");
      }
    },
    [screenToFlowPosition, setNodes],
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
    if (!placementPicker) return;
    const onDown = (ev: MouseEvent) => {
      const el = placementRef.current;
      if (el && ev.target instanceof Node && el.contains(ev.target)) return;
      setPlacementPicker(null);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [placementPicker]);

  const placeKindAtPicker = useCallback(
    (kind: WorkflowDragNodeKind) => {
      if (!placementPicker) return;
      setNodes((prev) => [...prev, buildAdAssetNode(kind, placementPicker.flow)]);
      setPlacementPicker(null);
      toast.success("Node added");
    },
    [placementPicker, setNodes],
  );

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

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const activeName = activePage?.name ?? "Page";

  const patchNodeData = useCallback(
    (nodeId: string, patch: Partial<AdAssetNodeData & WorkflowGroupNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowCanvasNode) : n,
        ),
      );
    },
    [setNodes],
  );

  return (
    <div className="relative h-full min-h-0 w-full">
      <WorkflowAmbientLayer waveKey={canvasWaveKey} className="z-0" />

      <WorkflowPagesPanel
        project={project}
        setProject={setProject}
        onSelectPage={selectPage}
        onAddPage={addPage}
        nodesEdgesRef={nodesEdgesRef}
      />

      <WorkflowNodePatchProvider onPatch={patchNodeData}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onSelectionChange={({ nodes: sel }) => {
            setSelectedNodes(sel as WorkflowCanvasNode[]);
          }}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView={false}
          panOnDrag={tool === "pan"}
          selectionOnDrag={tool === "select"}
          onPaneClick={() => {
            setAddOpen(false);
            setFrameOpen(false);
            setPlacementPicker(null);
          }}
          className="workflow-flow relative z-[1] !bg-transparent"
          defaultEdgeOptions={{
            style: { stroke: "rgba(167, 139, 250, 0.42)", strokeWidth: 2 },
          }}
        >
          <WorkflowReactFlowChrome
            tool={tool}
            setTool={setTool}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            setNodes={setNodes}
            activePageId={project.activePageId}
            activeName={activeName}
            selectedNodes={selectedNodes}
            frameOpen={frameOpen}
            setFrameOpen={setFrameOpen}
          />
        </ReactFlow>
      </WorkflowNodePatchProvider>

      {placementPicker ? (
        <div
          ref={placementRef}
          role="dialog"
          aria-label="Choose node type"
          className="pointer-events-auto fixed z-[200] w-[min(260px,calc(100vw-16px))] rounded-xl border border-white/12 bg-[#0b0912] p-3 shadow-2xl"
          style={{
            left: Math.max(8, Math.min(placementPicker.screenX, window.innerWidth - 268)),
            top: Math.max(8, Math.min(placementPicker.screenY + 12, window.innerHeight - 220)),
          }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">Place node</p>
          <p className="mb-3 text-[12px] text-white/55">What should be created here?</p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
              onClick={() => placeKindAtPicker("image")}
            >
              Image generator
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
              onClick={() => placeKindAtPicker("video")}
            >
              Video generator
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[13px] font-medium text-white/90 transition hover:border-violet-400/35 hover:bg-violet-500/15"
              onClick={() => placeKindAtPicker("variation")}
            >
              Variation
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowEditor({ spaceId }: { spaceId: string }) {
  const router = useRouter();

  const [workflowProject, setWorkflowProject] = useState<WorkflowProjectStateV1>(() => defaultWorkflowProject());
  const [workflowHydrated, setWorkflowHydrated] = useState(false);
  const [spaceName, setSpaceName] = useState("Untitled space");
  const [canvasWaveKey, setCanvasWaveKey] = useState(0);

  useEffect(() => {
    const idx = loadSpacesIndex().spaces;
    if (!idx.some((s) => s.id === spaceId)) {
      router.replace("/workflow");
      return;
    }
    const meta = idx.find((s) => s.id === spaceId);
    if (meta) setSpaceName(meta.name);
    setWorkflowProject(loadProjectForSpace(spaceId));
    setWorkflowHydrated(true);
  }, [spaceId, router]);

  useEffect(() => {
    if (!workflowHydrated) return;
    saveProjectForSpace(spaceId, workflowProject);
  }, [workflowHydrated, spaceId, workflowProject]);

  const showOnboarding = workflowHydrated && shouldShowWorkflowOnboarding(workflowProject);

  const canvasVisible = workflowHydrated && !showOnboarding;
  useEffect(() => {
    if (!canvasVisible) return;
    setCanvasWaveKey((k) => k + 1);
  }, [canvasVisible, spaceId]);

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
            className="inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#06070d]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_40%_at_50%_0%,rgba(139,92,246,0.05),transparent_70%)]" />
          <div className="relative flex h-full min-h-[480px] min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {workflowHydrated && !showOnboarding ? (
                <ReactFlowProvider>
                  <WorkflowFlowWorkspace
                    project={workflowProject}
                    setProject={setWorkflowProject}
                    canvasWaveKey={canvasWaveKey}
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

      <p className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 text-[10px] text-violet-200/30">
        Pages and canvas are saved in this browser
      </p>
    </div>
  );
}
