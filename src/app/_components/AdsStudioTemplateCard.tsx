"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdsStudioTemplateCardProps = {
  /** Same-origin static MP4 (e.g. `/studio/template/foo.mp4`). */
  previewUrl: string | null;
  label: string;
  /** Action when the user clicks the "Recreate" CTA. */
  onRecreate: () => void;
  /** Optional CTA label override. */
  ctaLabel?: ReactNode;
};

/**
 * Higgsfield-style template tile: paints the first frame of the preview MP4 as a
 * lightweight "poster" (no separate JPG required), then plays the clip on hover.
 * Cards outside the viewport stay completely idle thanks to IntersectionObserver.
 */
export function AdsStudioTemplateCard({
  previewUrl,
  label,
  onRecreate,
  ctaLabel,
}: AdsStudioTemplateCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const hoverRef = useRef(false);

  // Mount the <video> only once the card is near the viewport so we don't
  // pay decoder + metadata fetch costs for off-screen tiles.
  useEffect(() => {
    if (shouldMount) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldMount]);

  useEffect(() => {
    if (!shouldMount) return;
    const v = videoRef.current;
    if (!v || !previewUrl) return;

    const reveal = () => setFirstFrameReady(true);
    const onLoadedData = () => {
      try {
        // Without a separate poster image, seek slightly past 0 so the first
        // decoded frame is shown instead of a black tile.
        v.pause();
        v.currentTime = 0.001;
      } catch {
        /* ignore */
      }
      reveal();
    };

    v.addEventListener("loadedmetadata", reveal);
    v.addEventListener("loadeddata", onLoadedData);
    return () => {
      v.removeEventListener("loadedmetadata", reveal);
      v.removeEventListener("loadeddata", onLoadedData);
    };
  }, [shouldMount, previewUrl]);

  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;
    const v = videoRef.current;
    if (!v) return;

    if (v.preload !== "auto") v.preload = "auto";

    const playFromStart = () => {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      void v.play().catch(() => {});
    };

    if (v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      playFromStart();
      return;
    }

    const onCanPlay = () => {
      v.removeEventListener("canplay", onCanPlay);
      if (hoverRef.current) playFromStart();
    };
    v.addEventListener("canplay", onCanPlay, { once: true });
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = false;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  const showSkeleton = shouldMount && !firstFrameReady;

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black/35"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {previewUrl ? (
        <>
          {showSkeleton ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-gradient-to-br from-white/[0.04] via-white/[0.07] to-white/[0.03]"
            />
          ) : null}
          {shouldMount ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={videoRef}
              src={previewUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className={cn(
                "relative z-[2] h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.02]",
                firstFrameReady ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-violet-900/35 via-[#15141f] to-[#0a0a11] text-[11px] font-semibold text-white/35">
          Missing preview
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />
      <p className="pointer-events-none absolute left-3 top-2 z-[3] text-[11px] font-semibold text-white/90">{label}</p>
      <button
        type="button"
        onClick={onRecreate}
        className={cn(
          "absolute bottom-3 left-1/2 z-20 flex h-9 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white shadow-[0_4px_0_0_rgba(76,29,149,0.88)] ring-1 ring-violet-300/35 transition",
          "border border-violet-300/45 bg-violet-500 hover:bg-violet-400 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.88)] active:-translate-x-1/2 active:translate-y-px active:shadow-none",
          // Mobile has no hover — keep CTA visible. Desktop keeps hover reveal.
          "opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/55",
        )}
      >
        <Sparkles className="size-3.5 shrink-0 opacity-95" aria-hidden />
        {ctaLabel ?? "Recreate"}
      </button>
    </div>
  );
}
