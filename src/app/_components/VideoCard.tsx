"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc, thumbProxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { acquireVideoMountSlot, releaseVideoMountSlot } from "@/lib/videoMountSlots";

type VideoCardProps = {
  src: string;
  /** Shown until playback; use reference image in Link to Ad to avoid black idle frame. */
  poster?: string;
  className?: string;
  aspectClassName?: string;
  /** When provided, opens an external lightbox instead of the built-in one. */
  onOpenFullscreen?: () => void;
  /** Defaults to true. Set to false to disable internal fullscreen lightbox. */
  enableLightbox?: boolean;
  /**
   * Hint that this card is in the first ~6 above-the-fold tiles. Skips the
   * IntersectionObserver gate and the concurrent-mount semaphore so the visible
   * grid fills immediately. Off-screen tiles keep the throttle to avoid swamping
   * the network with header fetches.
   */
  eager?: boolean;
};

export default function VideoCard({
  src,
  poster,
  className,
  aspectClassName = "aspect-[9/16]",
  onOpenFullscreen,
  enableLightbox = true,
  eager = false,
}: VideoCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lightbox, setLightbox] = useState(false);
  // Lazy mount the <video> element only when it's near the viewport.
  // Avoids spinning up dozens of decoder pipelines for off-screen rows in History.
  const [shouldMount, setShouldMount] = useState(eager);
  // Becomes true once the first frame has been decoded — drives the fade from skeleton/poster.
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  // Tracks whether this VideoCard currently holds a global mount slot, so we release
  // exactly once (on first frame OR on unmount).
  const slotHeldRef = useRef(false);

  const playSrc = proxiedMediaSrc(src);
  // Posters are still images — request a 320px WebP so above-the-fold tiles transfer ~30 KB
  // instead of the full provider asset.
  const playPoster = poster?.trim() ? thumbProxiedMediaSrc(poster, 320) : undefined;

  // Step 1: detect that the card is near the viewport.
  const [nearViewport, setNearViewport] = useState(eager);
  useEffect(() => {
    if (nearViewport) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNearViewport(true);
            observer.disconnect();
            break;
          }
        }
      },
      // Tightened from 300px to 100px so off-screen tiles don't all rush to fetch the moov
      // atom at once. Combined with the slot semaphore below, only N=4 videos contend for
      // network at any moment.
      { rootMargin: "100px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nearViewport]);

  // Step 2: acquire a global mount slot before actually rendering the <video>.
  // Eager cards skip the queue entirely (above-the-fold).
  useEffect(() => {
    if (shouldMount || !nearViewport) return;
    if (eager) {
      setShouldMount(true);
      return;
    }
    let cancelled = false;
    void acquireVideoMountSlot().then(() => {
      if (cancelled) {
        releaseVideoMountSlot();
        return;
      }
      slotHeldRef.current = true;
      setShouldMount(true);
    });
    return () => {
      cancelled = true;
    };
  }, [eager, nearViewport, shouldMount]);

  // Release the slot when the component unmounts (covers the case where the user scrolls
  // past before the first frame ever decodes).
  useEffect(() => {
    return () => {
      if (slotHeldRef.current) {
        slotHeldRef.current = false;
        releaseVideoMountSlot();
      }
    };
  }, []);

  const openFullscreen = () => {
    if (typeof onOpenFullscreen === "function") return onOpenFullscreen();
    if (enableLightbox !== false) setLightbox(true);
  };

  // Without a poster, seek slightly past 0 so the first decoded frame shows (avoids all-black idle).
  // `loadedmetadata` fires earlier on many providers than `loadeddata` and is enough to display
  // the first frame, so we use both to flip `firstFrameReady` ASAP. Releasing the global
  // mount slot is also wired here so the next queued VideoCard can start fetching.
  useEffect(() => {
    if (!shouldMount) return;
    const v = videoRef.current;
    if (!v || !playSrc.trim()) return;

    const releaseSlot = () => {
      if (slotHeldRef.current) {
        slotHeldRef.current = false;
        releaseVideoMountSlot();
      }
    };
    const reveal = () => {
      setFirstFrameReady(true);
      releaseSlot();
    };
    const onLoadedData = () => {
      try {
        if (!playPoster) {
          v.pause();
          v.currentTime = 0.001;
        }
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
  }, [shouldMount, playSrc, playPoster]);

  const handleMouseEnter = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    // Bump preload to `auto` so the browser starts buffering the rest while we try to play.
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
      playFromStart();
    };
    v.addEventListener("canplay", onCanPlay, { once: true });
    void v.play().catch(() => {
      /* will retry in onCanPlay when buffer is ready */
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
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
    <>
      <div
        ref={containerRef}
        className={cn("group/vc relative overflow-hidden rounded-lg border border-white/10 bg-black", aspectClassName, className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {playPoster && !firstFrameReady ? (
          // Poster acts as a high-fidelity placeholder until the video can render its first frame.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playPoster}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
        ) : null}

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
            src={playSrc}
            poster={playPoster}
            muted
            playsInline
            preload="metadata"
            loop
            className={cn(
              "relative z-[2] h-full w-full cursor-pointer object-cover transition-opacity duration-200",
              firstFrameReady ? "opacity-100" : "opacity-0",
            )}
            onClick={openFullscreen}
          />
        ) : null}

        <button
          type="button"
          onClick={openFullscreen}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          aria-label="Open video fullscreen"
        />

        <a
          href={`/api/download?url=${encodeURIComponent(src)}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/vc:opacity-100 focus-visible:opacity-100"
          aria-label="Download video"
          title="Download"
        >
          <Download className="h-4 w-4" aria-hidden />
        </a>

        <button
          type="button"
          onClick={openFullscreen}
          className="absolute bottom-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/vc:opacity-100 focus-visible:opacity-100"
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {enableLightbox !== false && lightbox ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/80 transition hover:bg-black/80 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={playSrc}
              poster={playPoster}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="max-h-[90vh] max-w-[90vw] rounded-lg bg-black"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
