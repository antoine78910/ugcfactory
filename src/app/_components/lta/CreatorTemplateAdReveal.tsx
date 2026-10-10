"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Clapperboard, FileText, Package, Sparkles, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import {
  creatorTemplatePresenterVideoUrl,
  creatorTemplateUgcVideoUrl,
  creatorTemplateVideoUrl,
  type CreatorProductTemplate,
} from "@/lib/creatorProductTemplates";

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
  const ugcVideoUrl = creatorTemplateUgcVideoUrl(template.id);
  const presenterVideoUrl = creatorTemplatePresenterVideoUrl(template.id);
  const clips = [
    videoUrl ? { label: "Ads 1", url: videoUrl, downloadName: `${template.id}-ads-1.mp4` } : null,
    ugcVideoUrl ? { label: "Ads 2", url: ugcVideoUrl, downloadName: `${template.id}-ads-2.mp4` } : null,
    presenterVideoUrl
      ? { label: "Ads 3", url: presenterVideoUrl, downloadName: `${template.id}-ads-3.mp4` }
      : null,
  ].filter((clip): clip is { label: string; url: string; downloadName: string } => clip != null);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.min(TOTAL_MS, performance.now() - started));
    }, 50);
    return () => window.clearInterval(timer);
  }, [template.id]);

  const ready = elapsed >= TOTAL_MS;
  const progress = Math.min(1, elapsed / TOTAL_MS);
  const percent = Math.min(100, Math.round(progress * 100));
  const activeIndex = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden px-4 py-3">
      <style>{`
        @keyframes ee-ad-load {
          from { transform: scaleX(0.04); }
          to { transform: scaleX(1); }
        }
        @keyframes ee-ad-lightning {
          0% { background-position: 0% 50%; }
          100% { background-position: 220% 50%; }
        }
        video.ee-ad-preview::-webkit-media-controls,
        video.ee-ad-preview::-webkit-media-controls-enclosure,
        video.ee-ad-preview::-webkit-media-controls-panel,
        video.ee-ad-preview::-webkit-media-controls-start-playback-button {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      <button
        type="button"
        onClick={onBack}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white"
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
            className="flex w-full max-w-5xl flex-col items-center justify-center"
          >
            {clips.length ? (
              <div className="flex w-full flex-wrap items-end justify-center gap-6">
                {clips.map((clip) => (
                  <PreviewClip key={clip.label} label={clip.label} url={clip.url} downloadName={clip.downloadName} />
                ))}
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
            className="mx-auto w-full max-w-md"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={template.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Creating the ad</p>
                  <p className="truncate text-base font-semibold text-white">{template.name}</p>
                </div>
              </div>
              <p className="shrink-0 text-3xl font-black tabular-nums tracking-tight text-white">{percent}%</p>
            </div>

            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#7c30c7] via-[#d7b4ff] to-[#f3e8ff] shadow-[0_0_18px_rgba(176,110,240,0.9)]"
                style={{ animation: "ee-ad-load 10s linear forwards" }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/70">
              Completion {percent}%
            </p>

            {clips.map((clip) => (
              <video key={clip.url} src={clip.url} preload="auto" muted playsInline className="hidden" />
            ))}

            <ol className="mt-5 space-y-2">
              {STAGES.map((stage, index) => {
                const Icon = stage.icon;
                const done = index < activeIndex;
                const active = index === activeIndex;
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
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={
                            active
                              ? "bg-[linear-gradient(90deg,#ffffff_0%,#ffffff_35%,#f5e7ff_50%,#b06ef0_65%,#ffffff_100%)] bg-[length:220%_100%] bg-clip-text text-sm font-semibold text-transparent"
                              : "block text-sm font-semibold text-white"
                          }
                          style={active ? { animation: "ee-ad-lightning 1.1s linear infinite" } : undefined}
                        >
                          {stage.label}
                        </span>
                        {active ? (
                          <Zap
                            className="h-3.5 w-3.5 text-violet-200"
                            style={{ animation: "ee-ad-zap 0.9s ease-in-out infinite" }}
                            aria-hidden
                          />
                        ) : null}
                      </span>
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

function PreviewClip({
  label,
  url,
  downloadName,
}: {
  label: string;
  url: string;
  downloadName: string;
}) {
  return (
    <div className="flex w-[min(100%,240px)] flex-col items-center">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200/80">{label}</p>
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        ref={(el) => {
          if (!el) return;
          el.muted = true;
          void el.play().catch(() => {});
        }}
        className="ee-ad-preview h-auto w-full rounded-2xl border border-violet-300/25 bg-black object-contain shadow-[0_0_40px_rgba(139,92,246,0.22)]"
        style={{ maxHeight: "min(58dvh, 500px)", aspectRatio: "9 / 16" }}
      />
      <a
        href={url}
        download={downloadName}
        className="mt-3 inline-flex items-center justify-center rounded-xl border border-violet-300/35 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-white/90"
      >
        Download
      </a>
    </div>
  );
}
