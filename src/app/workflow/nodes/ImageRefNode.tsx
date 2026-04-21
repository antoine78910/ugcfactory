"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { Clapperboard, CopyPlus, Download, ImageIcon, Maximize2, Trash2, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { cloneWorkflowSelection } from "../workflowClone";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import { measureImageAspectFromObjectUrl, measureVideoAspectFromObjectUrl } from "../workflowMediaAspect";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

export type ImageRefNodeData = {
  label: string;
  imageUrl: string;
  source: "upload" | "avatar";
  mediaKind: "image" | "video";
  intrinsicAspect?: number;
};

export type ImageRefNodeType = Node<ImageRefNodeData, "imageRef">;

const FRAME_MAX_LONG = 260;
const CARD_PAD_X = 24;

function frameDimensions(intrinsicAspect?: number): { width: number; height: number } {
  const ar = intrinsicAspect && Number.isFinite(intrinsicAspect) && intrinsicAspect > 0 ? intrinsicAspect : 1;
  if (ar >= 1) {
    return { width: FRAME_MAX_LONG, height: Math.max(80, Math.round(FRAME_MAX_LONG / ar)) };
  }
  return { width: Math.max(80, Math.round(FRAME_MAX_LONG * ar)), height: FRAME_MAX_LONG };
}

const noop = () => {};

export function ImageRefNode({ id, data }: NodeProps<ImageRefNodeType>) {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frame = useMemo(() => frameDimensions(data.intrinsicAspect), [data.intrinsicAspect]);
  const cardWidth = frame.width + CARD_PAD_X;
  const isVideo = data.mediaKind === "video";
  const outputBubbleShellClass =
    "nodrag nopan relative h-8 w-8 shrink-0 rounded-full border border-white/15 bg-[#15151a]/95 transition";
  const outputBubbleHandleClass =
    "nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  const clearLeave = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const onEnter = useCallback(() => {
    clearLeave();
    setHovered(true);
  }, []);

  const onLeave = useCallback(() => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setHovered(false), 250);
  }, []);

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = data.imageUrl;
    a.download = data.label || "image";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }, [data.imageUrl, data.label]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, []);

  const duplicateNode = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    const edges = getEdges();
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    const res = cloneWorkflowSelection(nodes, edges, [self]);
    if (!res) return;
    const selectSet = new Set(res.selectIds);
    setNodes([
      ...nodes.map((n) => ({ ...n, selected: false })),
      ...res.nodesToAdd.map((n) => ({ ...n, selected: selectSet.has(n.id) })),
    ]);
    setEdges((eds) => [...eds, ...res.edgesToAdd]);
    toast.success("Duplicated");
    closeMenu();
  }, [closeMenu, getEdges, getNodes, id, setEdges, setNodes]);

  const deleteNode = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(getEdges().filter((e) => e.source !== id && e.target !== id));
    toast.success("Module deleted");
    closeMenu();
  }, [closeMenu, getEdges, getNodes, id, setEdges, setNodes]);

  const onReplaceFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const isVideo = (file.type || "").startsWith("video/");
      const mediaKind: "image" | "video" = isVideo ? "video" : "image";
      setReplacing(true);
      try {
        let intrinsicAspect: number | undefined;
        const blobUrl = URL.createObjectURL(file);
        try {
          intrinsicAspect = isVideo
            ? await measureVideoAspectFromObjectUrl(blobUrl)
            : await measureImageAspectFromObjectUrl(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
        const hosted = await uploadFileToCdn(file, { kind: mediaKind });
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: {
                    ...n.data,
                    imageUrl: hosted,
                    mediaKind,
                    source: "upload",
                    intrinsicAspect: intrinsicAspect && Number.isFinite(intrinsicAspect) ? intrinsicAspect : undefined,
                  },
                } as WorkflowCanvasNode)
              : n,
          ),
        );
        toast.success("Media replaced");
      } catch (err) {
        toast.error("Replace failed", {
          description: err instanceof Error ? err.message : "Please try another file.",
        });
      } finally {
        setReplacing(false);
      }
    },
    [id, setNodes],
  );
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = () => closeMenu();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeMenu();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={noop} variant="sticky" />

      <div className="relative flex items-start gap-1">
        <div
          className={cn(
            "group relative rounded-2xl border bg-[#0e0c14] transition-shadow duration-200",
            "border-white/10 hover:border-white/20",
          )}
          style={{ width: cardWidth }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onMouseMove={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
          onMouseOut={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuPos({ x: e.clientX, y: e.clientY });
            setMenuOpen(true);
          }}
        >
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onReplaceFileChange}
          />
          {/* Header */}
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-sky-500/45 bg-sky-950/80">
              <ImageIcon className="h-3.5 w-3.5 text-sky-300" />
            </div>
            <span className="truncate text-[12px] font-semibold text-white/85">{data.label || "Image"}</span>
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-white/30">
              {data.source === "avatar" ? "Avatar" : "Upload"}
            </span>
          </div>

          {/* Preview */}
          <div className="relative mx-3 mb-3 overflow-hidden rounded-xl" style={{ width: frame.width, height: frame.height }}>
            {isVideo ? (
              <video
                src={data.imageUrl}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.imageUrl}
                alt={data.label}
                className="h-full w-full object-cover"
                draggable={false}
              />
            )}

            {hovered && (
              <div className="absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/50 to-transparent p-2">
                <button
                  type="button"
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={replacing}
                  className="nodrag nopan rounded-lg bg-black/50 px-2 py-1.5 text-[11px] font-semibold text-white/85 backdrop-blur-sm transition hover:bg-black/70 hover:text-white disabled:opacity-60"
                  title={replacing ? "Replacing…" : "Replace media"}
                >
                  <span className="inline-flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5" />
                    Replace
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="nodrag nopan rounded-lg bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                  title="Enlarge"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="nodrag nopan rounded-lg bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="nodrag nopan relative z-[7] mt-2 flex shrink-0 flex-col gap-1">
          <div className={outputBubbleShellClass}>
            <Handle id="out" type="source" position={Position.Right} className={outputBubbleHandleClass} />
            <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
              {isVideo ? <Clapperboard className="h-3.5 w-3.5" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden />}
            </span>
          </div>
        </div>
      </div>

      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/88 p-2 backdrop-blur-[2px]"
              onClick={() => setLightbox(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Full media preview"
            >
              <button
                type="button"
                className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/65 p-2 text-white shadow-lg hover:bg-black/85"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(false);
                }}
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
              {isVideo ? (
                <video
                  src={data.imageUrl}
                  className="h-[92vh] w-[96vw] object-contain"
                  controls
                  autoPlay
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.imageUrl}
                  alt={data.label}
                  className="h-[92vh] w-[96vw] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>,
            document.body,
          )
        : null}
      {menuOpen && menuPos ? (
        <div
          className="fixed z-[250] w-48 rounded-xl border border-white/12 bg-[#101015] p-1.5 shadow-2xl"
          style={{
            left: Math.max(8, Math.min(menuPos.x, window.innerWidth - 204)),
            top: Math.max(8, Math.min(menuPos.y, window.innerHeight - 180)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-white/85 transition hover:bg-white/[0.08]"
            onClick={duplicateNode}
          >
            <CopyPlus className="h-4 w-4 text-white/70" strokeWidth={2} />
            Duplicate
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-rose-300 transition hover:bg-rose-500/15"
            onClick={deleteNode}
          >
            <Trash2 className="h-4 w-4 text-rose-300" strokeWidth={2} />
            Delete
          </button>
        </div>
      ) : null}
    </>
  );
}
