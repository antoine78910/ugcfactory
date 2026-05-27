"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  Images,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { primeRemoteMediaForDisplay } from "./workflowNodeRun";
import { triggerWorkflowMediaDownload } from "./workflowMediaDownload";
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

  const focusNodeOnCanvas = useCallback((nodeId: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("workflow:focus-node", { detail: { nodeId } }));
  }, []);

  if (collapsed) {
    return (
      <div className="flex h-full shrink-0 flex-col border-l border-white/10 bg-[#08080f]/95">
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
      <aside className="flex h-full w-[min(100%,300px)] shrink-0 flex-col border-l border-white/10 bg-[#08080f]/95 backdrop-blur-md">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-white/45">
              Run image or video nodes to see outputs here. List modules with media exports appear too.
            </p>
          ) : (
            <ul className="space-y-2">
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
                    "group rounded-xl border bg-black/25 transition",
                    dragOverId === it.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10",
                  )}
                >
                  <div className="flex gap-2 p-2">
                    {!readOnly ? (
                      <div
                        className="flex w-5 shrink-0 cursor-grab items-center justify-center text-white/30 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openPreview(index)}
                      className="relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                      title="View full size"
                    >
                      <MediaThumb item={it} />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                        <Maximize2 className="h-4 w-4 text-white" aria-hidden />
                      </span>
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => focusNodeOnCanvas(it.sourceNodeId)}
                        className="truncate text-left text-[12px] font-semibold text-white/90 hover:text-violet-100"
                        title="Focus source node on canvas"
                      >
                        {it.label}
                      </button>
                      <p className="truncate text-[10px] text-white/40">{it.pageName}</p>
                      <div className="mt-auto flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => downloadItem(it)}
                          className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/75 hover:bg-white/[0.08]"
                        >
                          <Download className="h-3 w-3" aria-hidden />
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => openPreview(index)}
                          className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/75 hover:bg-white/[0.08]"
                        >
                          <Maximize2 className="h-3 w-3" aria-hidden />
                          Enlarge
                        </button>
                      </div>
                    </div>
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

function MediaThumb({ item }: { item: WorkflowGeneratedMediaItem }) {
  const src = toRenderableMediaUrl(item.url);
  if (item.kind === "video") {
    return (
      <video src={src} className="h-full w-full object-cover" muted playsInline preload="metadata" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
