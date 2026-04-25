"use client";

import { Clapperboard, FileText, Heart, ImageIcon, Loader2, Search, SlidersHorizontal, Type, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const VB = { w: 680, h: 290 };

type Rect = { x: number; y: number; w: number; h: number };

const BASE: Record<"prompt" | "upload" | "imgGen" | "imgOut" | "videoPrompt" | "videoGen" | "videoOut", Rect> = {
  prompt: { x: 18, y: 18, w: 220, h: 76 },
  upload: { x: 18, y: 116, w: 220, h: 76 },
  imgGen: { x: 266, y: 66, w: 140, h: 74 },
  imgOut: { x: 430, y: 48, w: 108, h: 108 },
  videoPrompt: { x: 266, y: 172, w: 140, h: 74 },
  videoGen: { x: 430, y: 172, w: 108, h: 74 },
  videoOut: { x: 560, y: 144, w: 104, h: 104 },
};

const DEPTH: Record<keyof typeof BASE, number> = {
  prompt: 1,
  upload: 1.1,
  imgGen: 1.2,
  imgOut: 1.32,
  videoPrompt: 1.18,
  videoGen: 1.25,
  videoOut: 1.35,
};

const DEMO = {
  uploaded: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=420&h=420&fit=crop&q=70",
  generatedImage: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=420&h=420&fit=crop&q=70",
  generatedVideoPreview: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=420&h=420&fit=crop&q=70",
} as const;

function shiftRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
}
function portRight(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w, y: r.y + r.h / 2 };
}
function portLeft(r: Rect): { x: number; y: number } {
  return { x: r.x, y: r.y + r.h / 2 };
}
function bezierCurve(a: { x: number; y: number }, b: { x: number; y: number }, bend = 0.42): string {
  const mx = a.x + (b.x - a.x) * bend;
  const mx2 = a.x + (b.x - a.x) * (1 - bend);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${mx.toFixed(1)} ${a.y.toFixed(1)} ${mx2.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function WorkflowLandingHeroDiagram({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [, setFrame] = useState(0);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [hoverActive, setHoverActive] = useState(false);

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

  useEffect(() => {
    const t1 = window.setTimeout(() => setStep(1), 1200);
    const t2 = window.setTimeout(() => setStep(2), 3600);
    const t3 = window.setTimeout(() => setStep(3), 5900);
    const t4 = window.setTimeout(() => setStep(0), 9000);
    const cycle = window.setInterval(() => {
      setStep(0);
      window.setTimeout(() => setStep(1), 1200);
      window.setTimeout(() => setStep(2), 3600);
      window.setTimeout(() => setStep(3), 5900);
    }, 9000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearInterval(cycle);
    };
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!hoverActive) setHoverActive(true);
    targetRef.current = { x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) };
  };
  const onLeave = () => {
    setHoverActive(false);
    targetRef.current = { x: 0, y: 0 };
  };

  const { x: mx, y: my } = tiltRef.current;

  const placed = useMemo(() => {
    if (!hoverActive) {
      return {
        prompt: BASE.prompt,
        upload: BASE.upload,
        imgGen: BASE.imgGen,
        imgOut: BASE.imgOut,
        videoPrompt: BASE.videoPrompt,
        videoGen: BASE.videoGen,
        videoOut: BASE.videoOut,
      };
    }
    const cursor = {
      x: (mx * 0.5 + 0.5) * VB.w,
      y: (my * 0.5 + 0.5) * VB.h,
    };
    const pullRadius = 180;
    const pullMax = 24;
    const pull = (id: keyof typeof BASE) => {
      const b = BASE[id];
      const cx = b.x + b.w * 0.5;
      const cy = b.y + b.h * 0.5;
      const dx = cursor.x - cx;
      const dy = cursor.y - cy;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 0.001 || dist >= pullRadius) return { x: 0, y: 0 };
      const strength = Math.pow(1 - dist / pullRadius, 2);
      const unitX = dx / dist;
      const unitY = dy / dist;
      return {
        x: unitX * pullMax * DEPTH[id] * strength,
        y: unitY * pullMax * 0.85 * DEPTH[id] * strength,
      };
    };
    const o = (id: keyof typeof BASE) => pull(id);
    return {
      prompt: shiftRect(BASE.prompt, o("prompt").x, o("prompt").y),
      upload: shiftRect(BASE.upload, o("upload").x, o("upload").y),
      imgGen: shiftRect(BASE.imgGen, o("imgGen").x, o("imgGen").y),
      imgOut: shiftRect(BASE.imgOut, o("imgOut").x, o("imgOut").y),
      videoPrompt: shiftRect(BASE.videoPrompt, o("videoPrompt").x, o("videoPrompt").y),
      videoGen: shiftRect(BASE.videoGen, o("videoGen").x, o("videoGen").y),
      videoOut: shiftRect(BASE.videoOut, o("videoOut").x, o("videoOut").y),
    };
  }, [mx, my, hoverActive]);

  const paths = useMemo(() => {
    return {
      a: bezierCurve(portRight(placed.prompt), portLeft(placed.imgGen), 0.44),
      b: bezierCurve(portRight(placed.upload), portLeft(placed.imgGen), 0.34),
      c: bezierCurve(portRight(placed.imgGen), portLeft(placed.imgOut), 0.4),
      d: bezierCurve(portRight(placed.imgOut), portLeft(placed.videoGen), 0.5),
      e: bezierCurve(portRight(placed.videoPrompt), portLeft(placed.videoGen), 0.42),
      f: bezierCurve(portRight(placed.videoGen), portLeft(placed.videoOut), 0.42),
    };
  }, [placed]);

  const pct = (r: Rect) => ({
    left: `${(r.x / VB.w) * 100}%`,
    top: `${(r.y / VB.h) * 100}%`,
    width: `${(r.w / VB.w) * 100}%`,
    height: `${(r.h / VB.h) * 100}%`,
  });

  const imgGenerating = step === 1;
  const imgReady = step >= 2;
  const videoGenerating = step === 2;
  const videoReady = step >= 3;

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
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-[70%] w-[55%] rounded-full bg-cyan-500/10 blur-[70px]" />
      <div className="pointer-events-none absolute -right-6 top-0 h-[55%] w-[45%] rounded-full bg-violet-600/14 blur-[64px]" />

      <svg className="relative z-[1] block h-full w-full" viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id="hero-edge-green" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#86efac" stopOpacity="0.94" />
          </linearGradient>
          <linearGradient id="hero-edge-purple" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.94" />
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
          <path d={paths.a} fill="none" stroke="url(#hero-edge-green)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.b} fill="none" stroke="url(#hero-edge-green)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.c} fill="none" stroke="url(#hero-edge-green)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.d} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.e} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.f} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.1} strokeLinecap="round" />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 z-[2] text-[10px] leading-snug text-white/88 sm:text-[11px]">
        <div
          className="absolute overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={pct(placed.prompt)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2.5 py-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-white/50" />
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/45">Prompt text</span>
          </div>
          <div className="p-2">
            <p className="line-clamp-2 rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[9px] text-white/78">
              "Clean UGC portrait style, soft light, natural skin, ecommerce vibe"
            </p>
          </div>
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div
          className="absolute overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          style={pct(placed.upload)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2 py-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md border border-violet-500/45 bg-violet-950/65">
              <Upload className="h-3 w-3 text-violet-300" />
            </div>
            <span className="text-[8px] font-semibold tracking-tight text-white">Upload</span>
            <span className="ml-auto text-[8px] uppercase tracking-wide text-white/35">input</span>
          </div>
          <div className="p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEMO.uploaded} alt="" className="h-full w-full rounded-xl object-cover" draggable={false} />
          </div>
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div
          className={cn(
            "absolute overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
            imgGenerating && "ring-2 ring-violet-500/60 ring-offset-2 ring-offset-[#06070d]",
          )}
          style={pct(placed.imgGen)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2 py-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-white/50" />
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/45">Image Generator</span>
          </div>
          <div className="px-2 py-2">
            <div className="flex items-center gap-1.5 text-[9px] text-white/78">
            {imgGenerating ? <Loader2 className="h-3 w-3 animate-spin text-violet-200" /> : <Type className="h-3 w-3 text-white/45" />}
            {imgGenerating ? "Generating image..." : imgReady ? "Image generated" : "Waiting input"}
            </div>
          </div>
          <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div className="absolute overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)]" style={pct(placed.imgOut)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgReady ? DEMO.generatedImage : DEMO.uploaded} alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-200/95">
            {imgReady ? "Generated image" : "Uploaded image"}
          </div>
          <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div
          className="absolute overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={pct(placed.videoPrompt)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2.5 py-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-white/50" />
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/45">Prompt text</span>
          </div>
          <div className="p-2">
            <p className="line-clamp-2 rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[9px] text-white/78">
              "Slow cinematic push-in + subtle smile + product in hand"
            </p>
          </div>
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div
          className={cn(
            "absolute overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
            videoGenerating && "ring-2 ring-violet-500/60 ring-offset-2 ring-offset-[#06070d]",
          )}
          style={pct(placed.videoGen)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2 py-1.5">
            <Clapperboard className="h-3.5 w-3.5 text-white/50" />
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/45">Video Generator</span>
          </div>
          <div className="px-2 py-2">
            <div className="flex items-center gap-1.5 text-[9px] text-white/78">
            {videoGenerating ? <Loader2 className="h-3 w-3 animate-spin text-violet-200" /> : <Type className="h-3 w-3 text-white/45" />}
            {videoGenerating ? "Generating video..." : videoReady ? "Video generated" : "Waiting image"}
            </div>
          </div>
          <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div className="absolute overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)]" style={pct(placed.videoOut)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={videoReady ? DEMO.generatedVideoPreview : DEMO.generatedImage} alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-200/95">
            {videoReady ? "Generated video" : "Video preview"}
          </div>
          <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
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
