"use client";

import { Clapperboard, FileText, Heart, ImageIcon, Loader2, Search, SlidersHorizontal, Type, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const VB = { w: 860, h: 430 };

type Rect = { x: number; y: number; w: number; h: number };

const BASE: Record<"prompt" | "upload" | "imgGen" | "videoPrompt" | "videoGen", Rect> = {
  prompt: { x: 28, y: 28, w: 280, h: 86 },
  upload: { x: 28, y: 116, w: 170, h: 252 },
  imgGen: { x: 360, y: 22, w: 186, h: 360 },
  videoPrompt: { x: 330, y: 332, w: 220, h: 82 },
  videoGen: { x: 624, y: 72, w: 186, h: 360 },
};

const DEPTH: Record<keyof typeof BASE, number> = {
  prompt: 1,
  upload: 1.1,
  imgGen: 1.2,
  videoPrompt: 1.18,
  videoGen: 1.25,
};

const DEMO = {
  uploaded: "/workflow-hero/upload-3x4.png",
  generatedImage: "/workflow-hero/generated-image-9x16.png",
  generatedVideoPreview: "/workflow-hero/generated-video-preview-9x16.png",
  generatedVideo: "/workflow-hero/generated-video-preview-9x16.mp4",
} as const;
const DEMO_UPLOAD_FORMAT = "3:4";
const DEMO_IMAGE_FORMAT = "9:16";
const DEMO_VIDEO_FORMAT = "9:16";
const STEP_IMAGE_START_MS = 1000;
const STEP_IMAGE_READY_MS = 6000; // 5s image generation
const STEP_VIDEO_START_MS = 7000; // 1s pause after image reveal
const STEP_VIDEO_READY_MS = 12000; // 5s video generation
const STEP_CYCLE_MS = 17000; // 5s hold on final video preview

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
  const pointerRef = useRef({ x: 0, y: 0 });
  const tiltRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [, setFrame] = useState(0);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [hoverActive, setHoverActive] = useState(false);
  const [imageRevealFx, setImageRevealFx] = useState(false);
  const [videoRevealFx, setVideoRevealFx] = useState(false);

  const tick = useCallback(() => {
    const pointer = pointerRef.current;
    const tgt = targetRef.current;
    const smoothTarget = {
      x: tgt.x + (pointer.x - tgt.x) * 0.09,
      y: tgt.y + (pointer.y - tgt.y) * 0.09,
    };
    targetRef.current = smoothTarget;
    const cur = tiltRef.current;
    const nx = cur.x + (smoothTarget.x - cur.x) * 0.1;
    const ny = cur.y + (smoothTarget.y - cur.y) * 0.1;
    tiltRef.current = { x: nx, y: ny };
    const moving =
      Math.hypot(nx - cur.x, ny - cur.y) > 0.001 ||
      Math.hypot(nx - smoothTarget.x, ny - smoothTarget.y) > 0.004 ||
      Math.hypot(smoothTarget.x, smoothTarget.y) > 0.01;
    if (moving) setFrame((k) => (k + 1) % 1_000_000);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setStep(1), STEP_IMAGE_START_MS);
    const t2 = window.setTimeout(() => setStep(2), STEP_IMAGE_READY_MS);
    const t3 = window.setTimeout(() => setStep(3), STEP_VIDEO_START_MS);
    const t4 = window.setTimeout(() => setStep(4), STEP_VIDEO_READY_MS);
    const t5 = window.setTimeout(() => setStep(0), STEP_CYCLE_MS);
    const cycle = window.setInterval(() => {
      setStep(0);
      window.setTimeout(() => setStep(1), STEP_IMAGE_START_MS);
      window.setTimeout(() => setStep(2), STEP_IMAGE_READY_MS);
      window.setTimeout(() => setStep(3), STEP_VIDEO_START_MS);
      window.setTimeout(() => setStep(4), STEP_VIDEO_READY_MS);
    }, STEP_CYCLE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearTimeout(t5);
      window.clearInterval(cycle);
    };
  }, []);

  useEffect(() => {
    if (step === 2) {
      setImageRevealFx(true);
      const raf = window.requestAnimationFrame(() => setImageRevealFx(false));
      return () => window.cancelAnimationFrame(raf);
    }
    if (step === 4) {
      setVideoRevealFx(true);
      const t = window.setTimeout(() => setVideoRevealFx(false), 700);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!hoverActive) setHoverActive(true);
    pointerRef.current = { x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) };
  };
  const onLeave = () => {
    setHoverActive(false);
    pointerRef.current = { x: 0, y: 0 };
    targetRef.current = { x: 0, y: 0 };
  };

  const { x: mx, y: my } = tiltRef.current;

  const placed = useMemo(() => {
    if (!hoverActive) {
      return {
        prompt: BASE.prompt,
        upload: BASE.upload,
        imgGen: BASE.imgGen,
        videoPrompt: BASE.videoPrompt,
        videoGen: BASE.videoGen,
      };
    }
    const cursor = {
      x: (mx * 0.5 + 0.5) * VB.w,
      y: (my * 0.5 + 0.5) * VB.h,
    };
    const pullRadius = 168;
    const pullMax = 14;
    const pull = (id: keyof typeof BASE) => {
      const b = BASE[id];
      const cx = b.x + b.w * 0.5;
      const cy = b.y + b.h * 0.5;
      const dx = cursor.x - cx;
      const dy = cursor.y - cy;
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < 0.001 || dist >= pullRadius) return { x: 0, y: 0 };
      const strength = (1 - dist / pullRadius) * 0.85;
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
      videoPrompt: shiftRect(BASE.videoPrompt, o("videoPrompt").x, o("videoPrompt").y),
      videoGen: shiftRect(BASE.videoGen, o("videoGen").x, o("videoGen").y),
    };
  }, [mx, my, hoverActive]);

  const paths = useMemo(() => {
    return {
      a: bezierCurve(portRight(placed.prompt), portLeft(placed.imgGen), 0.44),
      b: bezierCurve(portRight(placed.upload), portLeft(placed.imgGen), 0.34),
      d: bezierCurve(portRight(placed.imgGen), portLeft(placed.videoGen), 0.5),
      e: bezierCurve(portRight(placed.videoPrompt), portLeft(placed.videoGen), 0.42),
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
  const videoGenerating = step === 3;
  const videoReady = step >= 4;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative isolate cursor-default select-none overflow-hidden",
        "bg-transparent",
        "min-h-[220px] w-full sm:min-h-[240px] lg:min-h-[260px]",
        className,
      )}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
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
          <path d={paths.d} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.1} strokeLinecap="round" />
          <path d={paths.e} fill="none" stroke="url(#hero-edge-purple)" strokeWidth={2.1} strokeLinecap="round" />
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
            <div className="max-h-[34px] min-h-[30px] overflow-y-auto rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[9px] text-white/78">
              <span>Clean UGC portrait style, soft light, natural skin, ecommerce vibe, premium product framing, subtle shadows</span>
              <span className="ml-0.5 inline-block h-[10px] w-[1px] animate-pulse bg-violet-200/90 align-[-1px]" />
            </div>
          </div>
          <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
        </div>

        <div
          className="absolute overflow-hidden rounded-2xl border border-violet-300/25 bg-[#121212]/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          style={pct(placed.upload)}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2 py-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md border border-violet-500/45 bg-violet-950/65">
              <Upload className="h-3 w-3 text-violet-300" />
            </div>
            <span className="text-[8px] font-semibold tracking-tight text-white">Upload</span>
            <span className="ml-auto text-[8px] uppercase tracking-wide text-white/35">input</span>
          </div>
          <div className="relative p-0">
            <div className="relative w-full overflow-hidden bg-black/35 aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={DEMO.uploaded} alt="" className="h-full w-full object-contain object-center saturate-110" draggable={false} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] via-transparent to-black/25" />
              <div className="absolute right-1 top-1 rounded bg-black/65 px-1 py-[1px] text-[7px] font-semibold tracking-wide text-white/85">
                {DEMO_UPLOAD_FORMAT}
              </div>
            </div>
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
          <div className="relative p-0">
            <div className="relative w-full overflow-hidden bg-black/40 aspect-[9/16]">
              {!imgGenerating ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={DEMO.generatedImage}
                    alt=""
                    className={cn(
                      "h-full w-full object-contain object-center transition-[filter,transform,opacity] duration-[2000ms] ease-out",
                      imageRevealFx ? "scale-[1.02] opacity-100 blur-[10px]" : "scale-100 opacity-100 blur-0",
                    )}
                    draggable={false}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/18" />
                  <div className="absolute right-1 top-1 rounded bg-black/65 px-1 py-[1px] text-[7px] font-semibold tracking-wide text-white/85">
                    {DEMO_IMAGE_FORMAT}
                  </div>
                </>
              ) : null}
              {imgGenerating ? (
                <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-black/42 backdrop-blur-[2px]">
                  <div className="relative h-9 w-9">
                    <span className="absolute inset-0 rounded-full border border-white/[0.09]" />
                    <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400/88 border-r-violet-400/22 [animation-duration:1.15s]" />
                  </div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/55">Generating</p>
                </div>
              ) : null}
            </div>
            <div className="absolute bottom-1.5 left-1.5 z-[3] rounded bg-black/60 px-1.5 py-0.5 text-[8px] text-white/85">
              {imgGenerating ? "Generating image..." : imgReady ? "Image generated" : "Waiting input"}
            </div>
          </div>
          <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/15 bg-[#15151a]/95" />
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
            <div className="max-h-[34px] min-h-[30px] overflow-y-auto rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[9px] text-white/78">
              <span>Creator holds the product close to camera, smiles naturally, then points at on-screen benefit text: “Launch UGC ads in minutes”. End with clean CTA card: “Try now on youry.io”. Keep realistic face, hands, and product details.</span>
              <span className="ml-0.5 inline-block h-[10px] w-[1px] animate-pulse bg-violet-200/90 align-[-1px]" />
            </div>
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
          <div className="relative p-0">
            <div className="relative w-full overflow-hidden bg-black/40 aspect-[9/16]">
              {!videoGenerating ? (
                <>
                  {videoReady ? (
                    <video
                      key={DEMO.generatedVideo}
                      src={DEMO.generatedVideo}
                      className={cn(
                        "h-full w-full object-contain object-center transition-all duration-700 ease-out",
                        videoRevealFx ? "scale-[1.03] opacity-100" : "scale-100 opacity-100",
                      )}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : imgReady ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={DEMO.generatedImage}
                      alt=""
                      className="h-full w-full object-contain object-center transition-all duration-700 ease-out"
                      draggable={false}
                    />
                  ) : null}
                  {videoRevealFx ? (
                    <div className="pointer-events-none absolute inset-0 z-[3] animate-pulse bg-white/10" />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/18" />
                  <div className="absolute right-1 top-1 rounded bg-black/65 px-1 py-[1px] text-[7px] font-semibold tracking-wide text-white/85">
                    {DEMO_VIDEO_FORMAT}
                  </div>
                </>
              ) : null}
              {videoGenerating ? (
                <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-black/42 backdrop-blur-[2px]">
                  <div className="relative h-9 w-9">
                    <span className="absolute inset-0 rounded-full border border-white/[0.09]" />
                    <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400/88 border-r-violet-400/22 [animation-duration:1.15s]" />
                  </div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/55">Rendering</p>
                </div>
              ) : null}
            </div>
            <div className="absolute bottom-1.5 left-1.5 z-[3] rounded bg-black/60 px-1.5 py-0.5 text-[8px] text-white/85">
              {videoGenerating ? "Generating video..." : videoReady ? "Video generated" : "Waiting image"}
            </div>
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
