"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GitBranch, GripVertical, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildProjectLabGraph,
  type LabEdge,
  type LabNode,
  type LabNodeKind,
} from "@/lib/linkToAd/buildProjectLabGraph";
import {
  defaultLabPersisted,
  loadLabPersisted,
  mergeUserLabIntoGraph,
  saveLabPersisted,
  type LabArtifacts,
  type LabOffsets,
} from "@/lib/linkToAd/labProjectStorage";
import { ProjectLabSidebar } from "@/app/_components/ProjectLabSidebar";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<LabNodeKind, string> = {
  root: "Project",
  generation: "Generation",
  brief: "Brief",
  angle: "Angle",
  ref_image: "Ref image",
  video: "Video",
  classic: "Run",
  folder: "Folder",
  custom_angle: "Custom angle",
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectTitle: string;
  storeUrl: string;
  runs: Array<{ id: string; created_at: string; extracted?: unknown }>;
  onOpenRunInEditor: (runId: string) => void;
};

function edgePath(
  source: LabNode,
  target: LabNode,
  shift: { x: number; y: number },
): string {
  const s = { x: source.x + source.w / 2 - shift.x, y: source.y + source.h - shift.y };
  const t = { x: target.x + target.w / 2 - shift.x, y: target.y - shift.y };
  const dy = Math.max(48, (t.y - s.y) * 0.45);
  return `M ${s.x} ${s.y} C ${s.x} ${s.y + dy} ${t.x} ${t.y - dy} ${t.x} ${t.y}`;
}

function computeBBox(nodes: LabNode[], pad = 80) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300, shiftX: 0, shiftY: 0, w: 400 + pad * 2, h: 300 + pad * 2 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  const shiftX = minX - pad;
  const shiftY = minY - pad;
  return {
    minX,
    minY,
    maxX,
    maxY,
    shiftX,
    shiftY,
    w: Math.max(400, maxX - minX + pad * 2),
    h: Math.max(300, maxY - minY + pad * 2),
  };
}

function LabNodeCard({
  node,
  selected,
  shift,
  onSelect,
  onNodeDragStart,
}: {
  node: LabNode;
  selected: boolean;
  shift: { x: number; y: number };
  onSelect: (n: LabNode) => void;
  onNodeDragStart: (e: React.PointerEvent, node: LabNode) => void;
}) {
  const isThumb =
    (node.kind === "ref_image" && node.imageUrl) ||
    (node.kind === "video" && node.videoUrl && !node.pendingVideo);

  return (
    <div
      data-lab-node="1"
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-xl border bg-black/55 shadow-lg backdrop-blur-md transition-[box-shadow] duration-200 touch-manipulation",
        selected ? "border-violet-400 ring-2 ring-violet-400/40 z-10" : "border-white/15 hover:border-violet-400/50",
        isThumb ? "cursor-grab p-0 active:cursor-grabbing" : "cursor-grab p-2 pt-6 active:cursor-grabbing",
      )}
      style={{ left: node.x - shift.x, top: node.y - shift.y, width: node.w, height: node.h }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-lab-drag]")) return;
        onSelect(node);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("[data-lab-drag]")) return;
        if (t.closest("button")) return;
        if (t.closest("a[href]")) return;
        onNodeDragStart(e, node);
      }}
    >
      <button
        type="button"
        data-lab-drag="1"
        className="absolute left-1 top-1 z-20 flex h-5 w-5 cursor-grab items-center justify-center rounded border border-white/15 bg-black/70 text-white/50 hover:border-violet-400/40 hover:text-violet-200 active:cursor-grabbing"
        title="Move"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          onNodeDragStart(e, node);
        }}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {node.kind === "ref_image" && node.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={node.imageUrl} alt="" draggable={false} className="h-full w-full object-cover select-none" />
      ) : node.kind === "ref_image" ? (
        <div className="flex h-full items-center justify-center bg-white/[0.04] text-[9px] text-white/35">No image</div>
      ) : node.kind === "video" && node.videoUrl && !node.pendingVideo ? (
        <div
          className="h-full w-full min-h-0"
          onMouseEnter={(e) => {
            const v = e.currentTarget.querySelector("video");
            if (v) void (v as HTMLVideoElement).play().catch(() => {});
          }}
          onMouseLeave={(e) => {
            const v = e.currentTarget.querySelector("video");
            if (v) {
              (v as HTMLVideoElement).pause();
              (v as HTMLVideoElement).currentTime = 0;
            }
          }}
        >
          <video
            src={node.videoUrl}
            className="pointer-events-none h-full w-full object-cover select-none"
            muted
            playsInline
            loop
          />
        </div>
      ) : (
        <div className="flex h-full flex-col justify-center gap-0.5 overflow-hidden text-left">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">{KIND_LABEL[node.kind]}</div>
          <div className="text-[11px] font-medium leading-snug text-white/90 line-clamp-4">{node.label}</div>
          {node.sublabel ? (
            <div className="text-[9px] leading-tight text-white/45 line-clamp-3">{node.sublabel}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ProjectLabCanvas({ open, onClose, projectTitle, storeUrl, runs, onOpenRunInEditor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<LabNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artifacts, setArtifactsState] = useState<LabArtifacts>(defaultLabPersisted().artifacts);
  const [offsets, setOffsets] = useState<LabOffsets>({});

  const dragRef = useRef<{ active: boolean; lx: number; ly: number }>({ active: false, lx: 0, ly: 0 });
  const nodeDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startDx: number;
    startDy: number;
  } | null>(null);

  const setArtifacts = useCallback(
    (next: LabArtifacts | ((prev: LabArtifacts) => LabArtifacts)) => {
      setArtifactsState((prev) => (typeof next === "function" ? (next as (p: LabArtifacts) => LabArtifacts)(prev) : next));
    },
    [],
  );

  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setHydrated(false);
      return;
    }
    setHydrated(false);
    const p = loadLabPersisted(storeUrl);
    setArtifactsState(p.artifacts);
    setOffsets(p.offsets);
    setSelected(null);
    setSelectedId(null);
    setHydrated(true);
  }, [open, storeUrl]);

  useEffect(() => {
    if (!open || !hydrated) return;
    const t = setTimeout(() => {
      saveLabPersisted(storeUrl, { v: 1, artifacts, offsets });
    }, 380);
    return () => clearTimeout(t);
  }, [open, storeUrl, artifacts, offsets, hydrated]);

  const mergedGraph = useMemo(() => {
    const raw = buildProjectLabGraph({ projectTitle, storeUrl, runs });
    const { minX, minY, maxX, maxY } = raw.bounds;
    const dx = minX;
    const dy = minY;
    const normalized: typeof raw = {
      nodes: raw.nodes.map((n) => ({ ...n, x: n.x - dx, y: n.y - dy })),
      edges: raw.edges,
      bounds: { minX: 0, minY: 0, maxX: maxX - dx, maxY: maxY - dy },
    };
    return mergeUserLabIntoGraph(normalized, artifacts);
  }, [projectTitle, storeUrl, runs, artifacts]);

  const displayNodes = useMemo(() => {
    return mergedGraph.nodes.map((n) => ({
      ...n,
      x: n.x + (offsets[n.id]?.dx ?? 0),
      y: n.y + (offsets[n.id]?.dy ?? 0),
    }));
  }, [mergedGraph.nodes, offsets]);

  /**
   * Origin for node `left` / edges: pinned to the auto-layout graph only (no user drag offsets).
   * Otherwise the bbox recenters on every move and nodes “snap” as if tied to the top-left.
   */
  const baseBBox = useMemo(() => computeBBox(mergedGraph.nodes), [mergedGraph.nodes]);
  const shift = useMemo(() => ({ x: baseBBox.shiftX, y: baseBBox.shiftY }), [baseBBox.shiftX, baseBBox.shiftY]);

  /** Canvas size follows dragged positions so nothing clips. */
  const extentBBox = useMemo(() => computeBBox(displayNodes), [displayNodes]);

  const nodeById = useMemo(() => {
    const m = new Map<string, LabNode>();
    for (const n of displayNodes) m.set(n.id, n);
    return m;
  }, [displayNodes]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width: vw, height: vh } = el.getBoundingClientRect();
    const bw = Math.max(1, extentBBox.w);
    const bh = Math.max(1, extentBBox.h);
    const s = Math.min(vw / bw, vh / bh) * 0.78;
    const clamped = Math.max(0.18, Math.min(s, 1.35));
    setZoom(clamped);
    setPan({
      x: vw / 2 - (bw / 2) * clamped,
      y: vh / 2 - (bh / 2) * clamped,
    });
  }, [extentBBox.w, extentBBox.h]);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(t);
  }, [open, fitView, mergedGraph.nodes.length, artifacts]);

  const focusNodeById = useCallback(
    (id: string) => {
      const n = displayNodes.find((x) => x.id === id);
      const el = containerRef.current;
      if (!n || !el) return;
      const rect = el.getBoundingClientRect();
      const cx = n.x + n.w / 2 - shift.x;
      const cy = n.y + n.h / 2 - shift.y;
      setPan({
        x: rect.width / 2 - cx * zoom,
        y: rect.height / 2 - cy * zoom,
      });
    },
    [displayNodes, shift.x, shift.y, zoom],
  );

  useEffect(() => {
    if (!open) return;
    const onResize = () => fitView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, fitView]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = nodeDragRef.current;
      if (!d) return;
      e.preventDefault();
      const wdx = (e.clientX - d.startClientX) / zoom;
      const wdy = (e.clientY - d.startClientY) / zoom;
      setOffsets((o) => ({
        ...o,
        [d.id]: { dx: d.startDx + wdx, dy: d.startDy + wdy },
      }));
    };
    const onUp = () => {
      nodeDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [zoom]);

  const onNodeDragStart = (e: React.PointerEvent, node: LabNode) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = offsets[node.id] ?? { dx: 0, dy: 0 };
    nodeDragRef.current = {
      id: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDx: cur.dx,
      startDy: cur.dy,
    };
    const captureEl = (e.currentTarget as HTMLElement) ?? (e.target as HTMLElement);
    captureEl.setPointerCapture?.(e.pointerId);
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0012;
    setZoom((z) => {
      const nz = Math.max(0.12, Math.min(2.8, z * (1 + delta)));
      const ratio = nz / z;
      setPan((p) => ({
        x: mx - (mx - p.x) * ratio,
        y: my - (my - p.y) * ratio,
      }));
      return nz;
    });
  }, []);

  const onBgPointerDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("[data-lab-node]") || el.closest("[data-lab-drag]")) return;
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
  };

  const onBgPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lx;
    const dy = e.clientY - dragRef.current.ly;
    dragRef.current.lx = e.clientX;
    dragRef.current.ly = e.clientY;
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onBgPointerUp = () => {
    dragRef.current.active = false;
  };

  const resetPositions = () => {
    setOffsets({});
    saveLabPersisted(storeUrl, { v: 1, artifacts, offsets: {} });
    requestAnimationFrame(() => fitView());
  };

  if (!open) return null;

  const { w: svgW, h: svgH } = extentBBox;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#06040d]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(rgba(167,139,250,0.22) 1.2px, transparent 1.2px)`,
          backgroundSize: "22px 22px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "11px 11px",
        }}
      />

      <header className="relative z-[2] flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/40 bg-violet-500/20">
            <GitBranch className="h-5 w-5 text-violet-200" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">Lab view: map</h2>
            <p className="truncate text-xs text-white/45">
              Nodes: drag to move · Background: pan · Scroll wheel: zoom
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={resetPositions}
            title="Reset positions"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setZoom((z) => Math.min(2.8, z * 1.2))}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setZoom((z) => Math.max(0.12, z / 1.2))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={fitView}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onClose} className="gap-1">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <ProjectLabSidebar
          nodes={displayNodes}
          edges={mergedGraph.edges}
          artifacts={artifacts}
          onArtifactsChange={setArtifacts}
          selectedId={selectedId}
          onSelectNodeId={(id) => {
            setSelectedId(id);
            if (id) {
              const n = nodeById.get(id);
              if (n) setSelected(n);
            } else setSelected(null);
          }}
          onFocusNode={focusNodeById}
        />

        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          onPointerLeave={onBgPointerUp}
        >
          <div
            className="absolute left-0 top-0 origin-top-left will-change-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg width={svgW} height={svgH} className="pointer-events-none absolute left-0 top-0 overflow-visible">
              <defs>
                <linearGradient id="labEdgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(167,139,250,0.15)" />
                  <stop offset="50%" stopColor="rgba(167,139,250,0.55)" />
                  <stop offset="100%" stopColor="rgba(196,181,253,0.2)" />
                </linearGradient>
              </defs>
              {mergedGraph.edges.map((ed: LabEdge) => {
                const s = nodeById.get(ed.source);
                const t = nodeById.get(ed.target);
                if (!s || !t) return null;
                return (
                  <path
                    key={ed.id}
                    d={edgePath(s, t, shift)}
                    fill="none"
                    stroke="url(#labEdgeGrad)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="opacity-80"
                  />
                );
              })}
            </svg>

            <div className="relative" style={{ width: svgW, height: svgH }}>
              {displayNodes.map((n) => (
                <LabNodeCard
                  key={n.id}
                  node={n}
                  shift={shift}
                  selected={selected?.id === n.id}
                  onSelect={(node) => {
                    setSelected(node);
                    setSelectedId(node.id);
                  }}
                  onNodeDragStart={onNodeDragStart}
                />
              ))}
            </div>
          </div>
        </div>

        {selected ? (
          <aside className="relative z-[2] w-[min(100%,300px)] shrink-0 border-l border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">Selected node</div>
            <div className="mt-2 text-sm font-medium text-white">{selected.label}</div>
            {selected.sublabel ? <p className="mt-1 text-xs text-white/50">{selected.sublabel}</p> : null}
            {selected.kind === "folder" || selected.kind === "custom_angle" ? (
              <p className="mt-2 text-[11px] text-cyan-200/70">
                Organization item (saved locally on this device). Real Link to Ad angles are under “Project data”.
              </p>
            ) : null}
            {selected.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.imageUrl} alt="" className="mt-3 w-full rounded-lg border border-white/10 object-cover" />
            ) : null}
            {selected.videoUrl && !selected.pendingVideo ? (
              <video
                src={selected.videoUrl}
                controls
                className="mt-3 w-full rounded-lg border border-white/10"
                playsInline
              />
            ) : null}
            {selected.pendingVideo ? (
              <p className="mt-3 text-xs text-amber-200/80">Video generating…</p>
            ) : null}
            {selected.runId ? (
              <Button type="button" className="mt-4 w-full" size="sm" onClick={() => onOpenRunInEditor(selected.runId!)}>
                Open in Link to Ad
              </Button>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
