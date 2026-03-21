"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Maximize2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildProjectLabGraph,
  type LabEdge,
  type LabNode,
  type LabNodeKind,
} from "@/lib/linkToAd/buildProjectLabGraph";

const KIND_LABEL: Record<LabNodeKind, string> = {
  root: "Projet",
  generation: "Génération",
  brief: "Brief",
  angle: "Angle",
  ref_image: "Image ref",
  video: "Vidéo",
  classic: "Run",
};
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  projectTitle: string;
  storeUrl: string;
  runs: Array<{ id: string; created_at: string; extracted?: unknown }>;
  /** Open Link to Ad for this run */
  onOpenRunInEditor: (runId: string) => void;
};

function edgePath(source: LabNode, target: LabNode): string {
  const s = { x: source.x + source.w / 2, y: source.y + source.h };
  const t = { x: target.x + target.w / 2, y: target.y };
  const dy = Math.max(48, (t.y - s.y) * 0.45);
  return `M ${s.x} ${s.y} C ${s.x} ${s.y + dy} ${t.x} ${t.y - dy} ${t.x} ${t.y}`;
}

function LabNodeCard({
  node,
  selected,
  onSelect,
}: {
  node: LabNode;
  selected: boolean;
  onSelect: (n: LabNode) => void;
}) {
  const isThumb = (node.kind === "ref_image" && node.imageUrl) || (node.kind === "video" && node.videoUrl && !node.pendingVideo);

  return (
    <div
      data-lab-node="1"
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-xl border bg-black/55 shadow-lg backdrop-blur-md transition-[box-shadow,transform] duration-200",
        selected
          ? "border-violet-400 ring-2 ring-violet-400/40 scale-[1.02] z-10"
          : "border-white/15 hover:border-violet-400/50 hover:shadow-[0_0_24px_rgba(139,92,246,0.15)]",
        isThumb ? "p-0" : "p-2",
      )}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onSelect(node)}
    >
      {node.kind === "ref_image" && node.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={node.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : node.kind === "ref_image" ? (
        <div className="flex h-full items-center justify-center bg-white/[0.04] text-[9px] text-white/35">Pas d’image</div>
      ) : node.kind === "video" && node.videoUrl && !node.pendingVideo ? (
        <video
          src={node.videoUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          loop
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
      ) : (
        <div className="flex h-full flex-col justify-center gap-0.5 overflow-hidden text-left">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
            {KIND_LABEL[node.kind]}
          </div>
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
  const dragRef = useRef<{ active: boolean; lx: number; ly: number }>({ active: false, lx: 0, ly: 0 });

  const graph = useMemo(() => {
    const raw = buildProjectLabGraph({ projectTitle, storeUrl, runs });
    const { minX, minY, maxX, maxY } = raw.bounds;
    const dx = minX;
    const dy = minY;
    return {
      nodes: raw.nodes.map((n) => ({ ...n, x: n.x - dx, y: n.y - dy })),
      edges: raw.edges,
      bounds: { minX: 0, minY: 0, maxX: maxX - dx, maxY: maxY - dy },
    };
  }, [projectTitle, storeUrl, runs]);

  const nodeById = useMemo(() => {
    const m = new Map<string, LabNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width: vw, height: vh } = el.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = graph.bounds;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const s = Math.min(vw / bw, vh / bh) * 0.82;
    const clamped = Math.max(0.22, Math.min(s, 1.35));
    setZoom(clamped);
    setPan({
      x: vw / 2 - (minX + bw / 2) * clamped,
      y: vh / 2 - (minY + bh / 2) * clamped,
    });
  }, [graph.bounds]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    const t = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(t);
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
    if (!open) return;
    const onResize = () => fitView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, fitView]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -e.deltaY * 0.0012;
      setZoom((z) => {
        const nz = Math.max(0.15, Math.min(2.8, z * (1 + delta)));
        const ratio = nz / z;
        setPan((p) => ({
          x: mx - (mx - p.x) * ratio,
          y: my - (my - p.y) * ratio,
        }));
        return nz;
      });
    },
    [],
  );

  const onBgPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-lab-node]")) return;
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
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

  if (!open) return null;

  const w = graph.bounds.maxX - graph.bounds.minX;
  const h = graph.bounds.maxY - graph.bounds.minY;
  const svgW = Math.max(w, 400);
  const svgH = Math.max(h, 300);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#06040d]">
      {/* Dot grid */}
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
            <h2 className="truncate text-sm font-semibold text-white">Vue lab — architecture</h2>
            <p className="truncate text-xs text-white/45">
              Molette : zoom · Glisser le fond : déplacer · Clic nœud : détail
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}
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
            Fermer
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={containerRef}
          className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
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
              {graph.edges.map((ed: LabEdge) => {
                const s = nodeById.get(ed.source);
                const t = nodeById.get(ed.target);
                if (!s || !t) return null;
                return (
                  <path
                    key={ed.id}
                    d={edgePath(s, t)}
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
              {graph.nodes.map((n) => (
                <LabNodeCard key={n.id} node={n} selected={selected?.id === n.id} onSelect={setSelected} />
              ))}
            </div>
          </div>
        </div>

        {selected ? (
          <aside className="relative z-[2] w-[min(100%,320px)] shrink-0 border-l border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">Nœud sélectionné</div>
            <div className="mt-2 text-sm font-medium text-white">{selected.label}</div>
            {selected.sublabel ? <p className="mt-1 text-xs text-white/50">{selected.sublabel}</p> : null}
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
              <p className="mt-3 text-xs text-amber-200/80">Vidéo en cours de génération…</p>
            ) : null}
            {selected.runId ? (
              <Button type="button" className="mt-4 w-full" size="sm" onClick={() => onOpenRunInEditor(selected.runId!)}>
                Ouvrir dans Link to Ad
              </Button>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
