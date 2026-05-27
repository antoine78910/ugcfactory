"use client";

import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Images,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";

import { cn } from "@/lib/utils";

import { primeRemoteMediaForDisplay } from "./workflowNodeRun";
import { triggerWorkflowMediaDownload } from "./workflowMediaDownload";
import { keepWheelInsideScrollable } from "./workflowWheelScroll";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import {
  collectGeneratedMediaFromProject,
  orderGeneratedMediaItems,
  toRenderableMediaUrl,
  type WorkflowGeneratedMediaItem,
  workflowMediaKindFromUrl,
} from "./workflowGeneratedMedia";

type Props = {
  project: WorkflowProjectStateV1;
  /** Persist custom recap order between reloads (e.g. workflow space id). */
  orderStorageKey?: string;
  readOnly?: boolean;
};

function loadStoredOrder(key: string | undefined): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveStoredOrder(key: string | undefined, ids: string[]) {
  if (!key || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function WorkflowMediaRecapSidebar({ project, orderStorageKey, readOnly = false }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>(() => loadStoredOrder(orderStorageKey));
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const collected = useMemo(() => collectGeneratedMediaFromProject(project), [project]);

  useEffect(() => {
    const ids = collected.map((it) => it.id);
    setOrderIds((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...missing];
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [collected]);

  useEffect(() => {
    saveStoredOrder(orderStorageKey, orderIds);
  }, [orderIds, orderStorageKey]);

  const items = useMemo(
    () => orderGeneratedMediaItems(collected, orderIds),
    [collected, orderIds],
  );

  const previewItem = previewIndex != null ? items[previewIndex] : null;

  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewIndex(null);
  }, []);

  const goPreview = useCallback(
    (delta: number) => {
      setPreviewIndex((idx) => {
        if (idx == null || items.length === 0) return idx;
        return (idx + delta + items.length) % items.length;
      });
    },
    [items.length],
  );

  useEffect(() => {
    if (previewIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") goPreview(-1);
      if (e.key === "ArrowRight") goPreview(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePreview, goPreview, previewIndex]);

  useEffect(() => {
    for (const it of items) {
      primeRemoteMediaForDisplay(it.url);
    }
  }, [items]);

  const downloadItem = useCallback((it: WorkflowGeneratedMediaItem) => {
    const renderUrl = toRenderableMediaUrl(it.url);
    const fallback = it.kind === "video" ? "workflow-video.mp4" : "workflow-image.jpg";
    triggerWorkflowMediaDownload(renderUrl, fallback);
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    if (readOnly || fromId === toId) return;
    setOrderIds((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(fromId);
      const toIdx = next.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    });
  }, [readOnly]);

  const stopWheelToCanvas = useCallback((e: WheelEvent) => {
    e.stopPropagation();
  }, []);

  if (collapsed) {
    return (
      <div
        className="nowheel flex h-full shrink-0 flex-col border-l border-white/10 bg-[#08080f]/95"
        onWheel={stopWheelToCanvas}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-full min-h-[120px] w-10 flex-col items-center justify-center gap-2 text-white/55 transition hover:bg-white/[0.06] hover:text-white/90"
          title="Show generated media"
          aria-label="Show generated media panel"
        >
          <PanelRightOpen className="h-4 w-4" />
          <span className="text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">
            Media ({items.length})
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      <aside
        className="nowheel flex h-full w-[min(100%,300px)] shrink-0 flex-col border-l border-white/10 bg-[#08080f]/95 backdrop-blur-md"
        onWheel={stopWheelToCanvas}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Images className="h-4 w-4 shrink-0 text-violet-300/80" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">Generated media</p>
              <p className="text-[11px] text-white/45">{items.length} item{items.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/55 transition hover:bg-white/[0.06] hover:text-white/85"
            title="Collapse panel"
            aria-label="Collapse media panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        <div
          className="nowheel min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2 studio-minimal-scrollbar"
          onWheelCapture={keepWheelInsideScrollable}
        >
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-white/45">
              Run image or video nodes to see outputs here. List modules with media exports appear too.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {items.map((it, index) => (
                <li
                  key={it.id}
                  draggable={!readOnly}
                  onDragStart={() => {
                    dragIdRef.current = it.id;
                  }}
                  onDragEnd={() => {
                    dragIdRef.current = null;
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setDragOverId(it.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === it.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    const from = dragIdRef.current;
                    if (from) reorder(from, it.id);
                    setDragOverId(null);
                  }}
                  className={cn(
                    "group relative aspect-square min-w-0 overflow-hidden rounded-lg border bg-black/40 transition",
                    !readOnly && "cursor-grab active:cursor-grabbing",
                    dragOverId === it.id ? "border-violet-400/50 ring-1 ring-violet-400/40" : "border-white/10",
                  )}
                >
                  <MediaThumb item={it} className="h-full w-full" />
                  {it.kind === "video" ? (
                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white/90">
                      <Clapperboard className="h-3 w-3" aria-hidden />
                    </span>
                  ) : null}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadItem(it);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg transition hover:bg-black/75"
                      title="Download"
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(index);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg transition hover:bg-black/75"
                      title="Full screen"
                      aria-label="Full screen"
                    >
                      <Maximize2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {previewItem && typeof document !== "undefined"
        ? createPortal(
            <MediaLightbox
              item={previewItem}
              index={previewIndex ?? 0}
              total={items.length}
              onClose={closePreview}
              onPrev={() => goPreview(-1)}
              onNext={() => goPreview(1)}
              onDownload={() => downloadItem(previewItem)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function MediaThumb({ item, className }: { item: WorkflowGeneratedMediaItem; className?: string }) {
  const src = toRenderableMediaUrl(item.url);
  if (item.kind === "video") {
    return (
      <video
        src={src}
        className={cn("object-cover", className)}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn("object-cover", className)}
      loading="lazy"
      decoding="async"
    />
  );
}

function MediaLightbox({
  item,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onDownload,
}: {
  item: WorkflowGeneratedMediaItem;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
}) {
  const src = toRenderableMediaUrl(item.url);
  const isVideo = item.kind === "video" || workflowMediaKindFromUrl(item.url) === "video";

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{item.label}</p>
          <p className="text-[11px] text-white/45">
            {index + 1} / {total} · {item.pageName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[12px] font-semibold text-white/90 hover:bg-white/10"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/90 hover:bg-white/10"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {total > 1 ? (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg hover:bg-black/75"
            aria-label="Previous media"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {isVideo ? (
          <video src={src} className="max-h-[calc(100vh-8rem)] max-w-[min(96vw,1200px)] object-contain" controls autoPlay playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="max-h-[calc(100vh-8rem)] max-w-[min(96vw,1200px)] object-contain" />
        )}
        {total > 1 ? (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg hover:bg-black/75"
            aria-label="Next media"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
