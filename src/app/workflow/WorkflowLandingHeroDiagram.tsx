"use client";

import { Heart, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** View-box layout: image prompt → image → video prompt → image → output (reference flow). */
const VB = { w: 560, h: 260 };

type Rect = { x: number; y: number; w: number; h: number };

const BASE: Record<"n1" | "n2" | "n3" | "n4" | "n5", Rect> = {
  n1: { x: 14, y: 12, w: 220, h: 56 },
  n2: { x: 18, y: 96, w: 92, h: 92 },
  n3: { x: 252, y: 8, w: 228, h: 56 },
  n4: { x: 264, y: 100, w: 92, h: 92 },
  n5: { x: 422, y: 64, w: 104, h: 104 },
};

const DEPTH: Record<keyof typeof BASE, number> = {
  n1: 1,
  n2: 1.35,
  n3: 1.05,
  n4: 1.4,
  n5: 1.15,
};

function shiftRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
}

function portRight(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w, y: r.y + r.h / 2 };
}
function portLeft(r: Rect): { x: number; y: number } {
  return { x: r.x, y: r.y + r.h / 2 };
}
function portLeftTop(r: Rect, t = 0.32): { x: number; y: number } {
  return { x: r.x, y: r.y + r.h * t };
}
function portLeftBottom(r: Rect, t = 0.68): { x: number; y: number } {
  return { x: r.x, y: r.y + r.h * t };
}

function bezierCurve(a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.42): string {
  const mx = a.x + (b.x - a.x) * bend;
  const mx2 = a.x + (b.x - a.x) * (1 - bend);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${mx.toFixed(1)} ${a.y.toFixed(1)} ${mx2.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

const DEMO_IMAGES = {
  a: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=320&h=320&fit=crop&q=70",
  b: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=320&h=320&fit=crop&q=70",
  out: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=320&h=320&fit=crop&q=70",
} as const;

export function WorkflowLandingHeroDiagram({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [, setFrame] = useState(0);

  const tick = useCallback(() => {
    const cur = tiltRef.current;
    const tgt = targetRef.current;
    const nx = cur.x + (tgt.x - cur.x) * 0.14;
    const ny = cur.y + (tgt.y - cur.y) * 0.14;
    tiltRef.current = { x: nx, y: ny };
    const moving =
      Math.hypot(nx - cur.x, ny - cur.y) > 0.001 ||
      Math.hypot(nx - tgt.x, ny - tgt.y) > 0.006 ||
      Math.hypot(tgt.x, tgt.y) > 0.015;
    if (moving) setFrame((k) => (k + 1) % 1_000_000);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    targetRef.current = {
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    };
  };

  const onLeave = () => {
    targetRef.current = { x: 0, y: 0 };
  };

  const { x: mx, y: my } = tiltRef.current;
  const maxShift = 22;

  const placed = useMemo(() => {
    const o = (id: keyof typeof BASE) => ({
      x: mx * maxShift * DEPTH[id],
      y: my * maxShift * 0.72 * DEPTH[id],
    });
    return {
      n1: shiftRect(BASE.n1, o("n1").x, o("n1").y),
      n2: shiftRect(BASE.n2, o("n2").x, o("n2").y),
      n3: shiftRect(BASE.n3, o("n3").x, o("n3").y),
      n4: shiftRect(BASE.n4, o("n4").x, o("n4").y),
      n5: shiftRect(BASE.n5, o("n5").x, o("n5").y),
    };
  }, [mx, my]);

  const paths = useMemo(() => {
    const g1 = bezierCurve(portRight(placed.n1), portLeft(placed.n2), 0.38);
    const p1 = bezierCurve(portRight(placed.n2), portLeft(placed.n4), 0.45);
    const g2 = bezierCurve(portRight(placed.n3), portLeftTop(placed.n5, 0.28), 0.5);
    const p2 = bezierCurve(portRight(placed.n4), portLeftBottom(placed.n5, 0.72), 0.48);
    return { g1, p1, g2, p2 };
  }, [placed]);

  const pct = (r: Rect) => ({
    left: `${(r.x / VB.w) * 100}%`,
    top: `${(r.y / VB.h) * 100}%`,
    width: `${(r.w / VB.w) * 100}%`,
    height: `${(r.h / VB.h) * 100}%`,
  });

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative isolate cursor-default select-none overflow-hidden rounded-2xl border border-white/[0.1]",
        "bg-[#07080f]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        "min-h-[220px] w-full sm:min-h-[240px] lg:min-h-[260px]",
        className,
      )}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.2]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-[70%] w-[55%] rounded-full bg-cyan-500/10 blur-[70px]" />
      <div className="pointer-events-none absolute -right-6 top-0 h-[55%] w-[45%] rounded-full bg-violet-600/14 blur-[64px]" />

      <svg
        className="relative z-[1] block h-full w-full"
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id="hero-edge-green" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#86efac" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="hero-edge-purple" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.95" />
          </linearGradient>
          <filter id="hero-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#hero-glow)">
          <path d={paths.g1} fill="none" stroke="url(#hero-edge-green)" strokeWidth={2.2} strokeLinecap="round" />
          <path d={paths.g2} fill="none" stroke="url(#hero-edge-green)" strokeWidth={2.2} strokeLinecap="round" />
          <path d={paths.p1} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.2} strokeLinecap="round" />
          <path d={paths.p2} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.2} strokeLinecap="round" />
        </g>

        {(
          [
            { p: portRight(placed.n1), stroke: "#86efac" },
            { p: portLeft(placed.n2), stroke: "#86efac" },
            { p: portRight(placed.n3), stroke: "#86efac" },
            { p: portLeftTop(placed.n5, 0.28), stroke: "#86efac" },
            { p: portRight(placed.n2), stroke: "#d8b4fe" },
            { p: portLeft(placed.n4), stroke: "#d8b4fe" },
            { p: portRight(placed.n4), stroke: "#d8b4fe" },
            { p: portLeftBottom(placed.n5, 0.72), stroke: "#d8b4fe" },
          ] as const
        ).map((dot, i) => (
          <circle key={i} cx={dot.p.x} cy={dot.p.y} r={3.2} fill="#0b0d14" stroke={dot.stroke} strokeWidth={1.4} />
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-0 z-[2] text-[10px] leading-snug text-white/88 sm:text-[11px]">
        <div
          className="absolute flex flex-col rounded-xl border border-white/[0.12] bg-black/60 px-2.5 py-2 shadow-lg backdrop-blur-sm sm:px-3 sm:py-2.5"
          style={pct(placed.n1)}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-emerald-500/18 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-100 sm:text-[9px]">
              Image
            </span>
            <span className="text-[8px] text-white/45 sm:text-[9px]">prompt module</span>
          </div>
          <p className="mt-1 line-clamp-3 text-[9px] font-normal text-white/78 sm:text-[10px] sm:leading-snug">
            Dreamy full-body portrait of a silhouetted figure in motion against a soft, cool blue backdrop—long exposure
            double-exposure style.
          </p>
        </div>

        <div className="absolute overflow-hidden rounded-2xl border border-white/[0.14] shadow-md ring-1 ring-white/[0.05]" style={pct(placed.n2)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative remote demo; CSP allows https: images */}
          <img src={DEMO_IMAGES.a} alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-200/95">
            Image
          </div>
        </div>

        <div
          className="absolute flex flex-col rounded-xl border border-white/[0.12] bg-black/60 px-2.5 py-2 shadow-lg backdrop-blur-sm sm:px-3 sm:py-2.5"
          style={pct(placed.n3)}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-violet-500/22 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-100 sm:text-[9px]">
              Video
            </span>
            <span className="text-[8px] text-white/45 sm:text-[9px]">prompt module</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[9px] font-normal text-white/78 sm:text-[10px]">
            Slowly and cinematically zoom out of the scene, focusing on the subject and the background
          </p>
        </div>

        <div className="absolute overflow-hidden rounded-2xl border border-white/[0.14] shadow-md ring-1 ring-white/[0.05]" style={pct(placed.n4)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DEMO_IMAGES.b} alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-200/95">
            Image
          </div>
        </div>

        <div
          className="absolute overflow-hidden rounded-2xl border border-emerald-400/28 shadow-lg ring-1 ring-emerald-400/12"
          style={pct(placed.n5)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DEMO_IMAGES.out} alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-200/95">
            Output
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 z-[3] flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/55 px-2 py-1.5 text-white/40 backdrop-blur-sm">
        <Heart className="h-3.5 w-3.5" strokeWidth={2} />
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
        <Search className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
    </div>
  );
}
