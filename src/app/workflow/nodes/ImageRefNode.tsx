"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { Clapperboard, CopyPlus, ImageIcon, Loader2, Maximize2, Trash2, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { cloneWorkflowSelection } from "../workflowClone";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import { isVideoFile, measureImageAspectFromObjectUrl, measureVideoAspectFromObjectUrl } from "../workflowMediaAspect";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

export type ImageRefNodeData = {
  label: string;
  imageUrl: string;
  source: "upload" | "avatar";
  mediaKind: "image" | "video";
  intrinsicAspect?: number;
  videoExtractedFirstFrameUrl?: string;
  videoExtractedLastFrameUrl?: string;
};

export type ImageRefNodeType = Node<ImageRefNodeData, "imageRef">;

const FRAME_MAX_LONG = 260;
const CARD_PAD_X = 0;
const EXTRACTED_FRAME_MAX_LONG = 520;

async function waitVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onMeta = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onErr);
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        reject(new Error("Could not read video metadata."));
        return;
      }
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onErr);
      reject(new Error("Could not load video for frame extraction."));
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

async function extractVideoFrameJpegDataUrl(video: HTMLVideoElement, end: boolean): Promise<string> {
  await waitVideoMetadata(video);
  const duration = video.duration;
  const targetT = end ? Math.max(0, duration - 0.08) : 0;
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("Could not seek video for frame extraction."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    if (Math.abs(video.currentTime - targetT) < 0.001) {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
      return;
    }
    video.currentTime = targetT;
  });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Video frame size unavailable.");
  const scale = Math.min(1, EXTRACTED_FRAME_MAX_LONG / Math.max(vw, vh));
  const tw = Math.max(1, Math.round(vw * scale));
  const th = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(video, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function extractVideoFrameJpegDataUrlFromUrl(videoUrl: string, end: boolean): Promise<string> {
  const trimmed = videoUrl.trim();
  if (!trimmed) throw new Error("Missing video URL.");
  const bust = trimmed.includes("?") ? `${trimmed}&_wf_extract=${Date.now()}` : `${trimmed}?_wf_extract=${Date.now()}`;
  const res = await fetch(`/api/download?url=${encodeURIComponent(bust)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download video (${res.status}).`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.src = objectUrl;
  try {
    return await extractVideoFrameJpegDataUrl(v, end);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.label || "Upload");
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [frameExtractBusy, setFrameExtractBusy] = useState<"first" | "last" | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExtractedForUrlRef = useRef<string | null>(null);

  const frame = useMemo(() => frameDimensions(data.intrinsicAspect), [data.intrinsicAspect]);
  const cardWidth = frame.width + CARD_PAD_X;
  const isVideo = data.mediaKind === "video";
  const outputBubbleShellClass =
    "workflow-port-create-cursor nodrag nopan relative h-8 w-8 shrink-0 rounded-full border border-white/15 bg-[#15151a]/95 transition";
  const outputBubbleHandleClass =
    "workflow-port-create-cursor nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  useEffect(() => {
    if (!titleEditing) setTitleDraft(data.label || "Upload");
  }, [data.label, titleEditing]);

  useEffect(() => {
    if (titleEditing) titleInputRef.current?.focus();
  }, [titleEditing]);

  const commitTitle = useCallback(() => {
    const next = titleDraft.trim() || "Upload";
    setTitleEditing(false);
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? ({
              ...n,
              data: {
                ...n.data,
                label: next,
              },
            } as WorkflowCanvasNode)
          : n,
      ),
    );
  }, [id, setNodes, titleDraft]);

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
      const isVideo = isVideoFile(file);
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
                    videoExtractedFirstFrameUrl: undefined,
                    videoExtractedLastFrameUrl: undefined,
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

  const onExtractVideoFrame = useCallback(
    async (which: "first" | "last") => {
      if (!isVideo) return;
      const src = data.imageUrl?.trim();
      if (!src) {
        toast.error("No video", { description: "Upload or replace the video first." });
        return;
      }
      setFrameExtractBusy(which);
      try {
        const extracted = await extractVideoFrameJpegDataUrlFromUrl(src, which === "last");
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: {
                    ...n.data,
                    ...(which === "first"
                      ? { videoExtractedFirstFrameUrl: extracted }
                      : { videoExtractedLastFrameUrl: extracted }),
                  },
                } as WorkflowCanvasNode)
              : n,
          ),
        );
        toast.success(which === "first" ? "Start image extracted" : "End image extracted");
      } catch (err) {
        toast.error("Frame extraction failed", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setFrameExtractBusy(null);
      }
    },
    [data.imageUrl, id, isVideo, setNodes],
  );

  /**
   * Auto-extract first and last frame as soon as a video upload is hosted on the CDN.
   * Skipped while the URL is still a local blob (those go through `/api/download` and
   * would 404). Tracks the URL we already auto-extracted from so re-renders don't loop.
   */
  useEffect(() => {
    if (!isVideo) return;
    const src = (data.imageUrl ?? "").trim();
    if (!src) return;
    if (src.startsWith("blob:")) return;
    if (autoExtractedForUrlRef.current === src) return;
    if (data.videoExtractedFirstFrameUrl && data.videoExtractedLastFrameUrl) {
      autoExtractedForUrlRef.current = src;
      return;
    }
    if (frameExtractBusy) return;

    let cancelled = false;
    autoExtractedForUrlRef.current = src;
    void (async () => {
      try {
        const updates: Partial<ImageRefNodeData> = {};
        if (!data.videoExtractedFirstFrameUrl) {
          const first = await extractVideoFrameJpegDataUrlFromUrl(src, false);
          if (cancelled) return;
          updates.videoExtractedFirstFrameUrl = first;
        }
        if (!data.videoExtractedLastFrameUrl) {
          const last = await extractVideoFrameJpegDataUrlFromUrl(src, true);
          if (cancelled) return;
          updates.videoExtractedLastFrameUrl = last;
        }
        if (Object.keys(updates).length === 0) return;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id
              ? ({
                  ...n,
                  data: { ...n.data, ...updates },
                } as WorkflowCanvasNode)
              : n,
          ),
        );
      } catch {
        // Silent: the user can still trigger extraction manually by double-clicking the bubbles.
        autoExtractedForUrlRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    data.imageUrl,
    data.videoExtractedFirstFrameUrl,
    data.videoExtractedLastFrameUrl,
    frameExtractBusy,
    id,
    isVideo,
    setNodes,
  ]);

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

      <div className="relative flex items-end gap-1">
        <div className="absolute left-0 -top-6 z-[6] flex min-w-0 items-center gap-2.5 pr-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md border border-violet-500/45 bg-violet-950/65">
            {isVideo ? (
              <Clapperboard className="h-3.5 w-3.5 text-violet-300" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-violet-300" />
            )}
          </div>
          {titleEditing ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTitleDraft(data.label || "Upload");
                  setTitleEditing(false);
                }
              }}
              className="nodrag nopan min-w-0 rounded border border-white/20 bg-black/35 px-2 py-0.5 text-[12px] font-semibold tracking-tight text-white outline-none focus:border-violet-400/60"
            />
          ) : (
            <button
              type="button"
              className="nodrag nopan min-w-0 truncate text-left text-[13px] font-semibold tracking-tight text-white"
              onClick={(e) => {
                e.stopPropagation();
                setTitleEditing(true);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setTitleEditing(true);
              }}
              title="Rename"
            >
              {data.label || "Upload"}
            </button>
          )}
          <span className="text-[10px] font-medium uppercase tracking-wide text-white/35">
            {data.source === "avatar" ? "Avatar" : "Upload"}
          </span>
        </div>
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border bg-[#121212]/98 transition-shadow duration-200",
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
          {/* Preview */}
          <div className="relative overflow-hidden rounded-none" style={{ width: frame.width, height: frame.height }}>
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
          {isVideo ? (
            <>
              <div className={cn(outputBubbleShellClass, data.videoExtractedFirstFrameUrl && "border-emerald-400/35")}>
                <Handle
                  id="videoFirst"
                  type="source"
                  position={Position.Right}
                  className={outputBubbleHandleClass}
                  title="Start image output, double-click to extract from the uploaded video"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void onExtractVideoFrame("first");
                  }}
                />
                <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                  {frameExtractBusy === "first" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <span
                  className="pointer-events-none absolute -bottom-1 -right-1 z-[3] flex h-4 min-w-4 items-center justify-center rounded-full border border-white/15 bg-[#15151a] px-1 text-[8px] font-bold uppercase tracking-wide text-white/85 shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
                  aria-hidden
                >
                  S
                </span>
              </div>
              <div className={cn(outputBubbleShellClass, data.videoExtractedLastFrameUrl && "border-emerald-400/35")}>
                <Handle
                  id="videoLast"
                  type="source"
                  position={Position.Right}
                  className={outputBubbleHandleClass}
                  title="End image output, double-click to extract from the uploaded video"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void onExtractVideoFrame("last");
                  }}
                />
                <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                  {frameExtractBusy === "last" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <span
                  className="pointer-events-none absolute -bottom-1 -right-1 z-[3] flex h-4 min-w-4 items-center justify-center rounded-full border border-white/15 bg-[#15151a] px-1 text-[8px] font-bold uppercase tracking-wide text-white/85 shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
                  aria-hidden
                >
                  E
                </span>
              </div>
            </>
          ) : null}
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
