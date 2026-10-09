"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { creatorTemplateVideoUrl, type CreatorProductTemplate } from "@/lib/creatorProductTemplates";

const TOTAL_MS = 7500;

const LINES = [
  "Opening the product page",
  "Pulling the offer",
  "Writing the voiceover",
  "Directing the shot",
  "Rendering the ad",
] as const;

export function CreatorTemplateUrlGeneration({
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
  const line = LINES[Math.min(LINES.length - 1, Math.floor(progress * LINES.length))];
  const ring = Math.round(progress * 360);

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
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-sm flex-col items-center"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-200/70">Generated</p>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-white">{template.name}</h2>
            {videoUrl ? (
              <div className="mt-6 w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full max-w-sm flex-col items-center"
            role="status"
            aria-live="polite"
          >
            <div
              className="relative grid h-44 w-44 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#b06ef0 ${ring}deg, rgba(255,255,255,0.08) ${ring}deg)`,
              }}
            >
              <div className="absolute inset-[7px] rounded-full bg-[#0b0912]" />
              <div className="relative h-28 w-28 overflow-hidden rounded-full border border-white/10 bg-white shadow-[0_0_40px_rgba(176,110,240,0.35)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={template.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
              </div>
            </div>
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-200/70">Generating</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={line}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="mt-2 text-center text-lg font-semibold text-white"
              >
                {line}
              </motion.p>
            </AnimatePresence>
            <p className="mt-1 text-sm text-white/45">{template.name}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
