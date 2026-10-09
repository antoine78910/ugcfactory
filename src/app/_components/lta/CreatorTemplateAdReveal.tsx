"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Clapperboard, FileText, Package, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { creatorTemplateVideoUrl, type CreatorProductTemplate } from "@/lib/creatorProductTemplates";

const TOTAL_MS = 10000;

const STAGES = [
  { label: "Product", detail: "Reading the product page", icon: Package },
  { label: "Copywriting", detail: "Writing the ad script", icon: FileText },
  { label: "Creation", detail: "Building the scene", icon: Sparkles },
  { label: "Video", detail: "Rendering the final ad", icon: Clapperboard },
] as const;

export function CreatorTemplateAdReveal({
  template,
  onBack,
}: {
  template: CreatorProductTemplate;
  onBack: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const videoUrl = creatorTemplateVideoUrl(template.id);

  useEffect(() => {
    let cancelled = false;
    setElapsed(0);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      setElapsed(Math.min(TOTAL_MS, now - started));
      if (now - started < TOTAL_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [template.id]);

  const ready = elapsed >= TOTAL_MS;
  const progress = Math.min(1, elapsed / TOTAL_MS);
  const activeIndex = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-2 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-1.5 self-start rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Return to Link to Ad
      </button>

      <AnimatePresence mode="wait">
        {ready ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-xl flex-col items-center"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">Ready</p>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Your ad is ready
            </h2>
            <p className="mt-1.5 text-sm text-white/50">{template.name}</p>
            {videoUrl ? (
              <div className="mt-6 w-full max-w-sm overflow-hidden rounded-2xl border border-violet-300/25 bg-black shadow-[0_0_40px_rgba(139,92,246,0.22)]">
                <video
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain"
                />
              </div>
            ) : (
              <p className="mt-6 text-center text-sm text-white/55">This product video is not in the library yet.</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={template.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Link to Ad</p>
                <p className="truncate text-base font-semibold text-white">{template.name}</p>
              </div>
            </div>

            <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7c30c7] via-[#b06ef0] to-[#f3e8ff] shadow-[0_0_16px_rgba(176,110,240,0.8)]"
                style={{ width: `${Math.max(6, progress * 100)}%`, transition: "width 180ms linear" }}
              />
            </div>

            {videoUrl ? (
              <video src={videoUrl} preload="auto" muted playsInline className="hidden" />
            ) : null}
            <ol className="mt-6 space-y-2">
              {STAGES.map((stage, index) => {
                const Icon = stage.icon;
                const done = index < activeIndex || (index === activeIndex && progress >= 1);
                const active = index === activeIndex && progress < 1;
                return (
                  <li
                    key={stage.label}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                      active
                        ? "border-violet-300/40 bg-violet-400/10 shadow-[0_0_24px_rgba(139,92,246,0.16)]"
                        : done
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-transparent bg-transparent opacity-45"
                    }`}
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? "border-violet-300/40 bg-violet-400/20 text-white"
                          : active
                            ? "border-violet-300/50 bg-violet-400/15 text-violet-100"
                            : "border-white/10 bg-white/5 text-white/40"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{stage.label}</span>
                      <span className="block text-xs text-white/50">{stage.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
