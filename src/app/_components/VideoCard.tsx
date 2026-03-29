"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";

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
};

export default function VideoCard({
  src,
  poster,
  className,
  aspectClassName = "aspect-[9/16]",
  onOpenFullscreen,
  enableLightbox = true,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const playSrc = proxiedMediaSrc(src);
  const playPoster = poster?.trim() ? proxiedMediaSrc(poster) : undefined;

  const openFullscreen = () => {
    if (typeof onOpenFullscreen === "function") return onOpenFullscreen();
    if (enableLightbox !== false) setLightbox(true);
  };

  /** Without a poster, seek slightly past 0 so the first decoded frame shows (avoids all-black idle). */
  useEffect(() => {
    if (playPoster) return;
    const v = videoRef.current;
    if (!v || !playSrc.trim()) return;

    const onLoadedData = () => {
      try {
        v.pause();
        v.currentTime = 0.001;
      } catch {
        /* ignore */
      }
    };

    v.addEventListener("loadeddata", onLoadedData);
    return () => v.removeEventListener("loadeddata", onLoadedData);
  }, [playSrc, playPoster]);

  const handleMouseEnter = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

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

  return (
    <>
      <div
        className={cn("group/vc relative overflow-hidden rounded-lg border border-white/10 bg-black", aspectClassName, className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={playSrc}
          poster={playPoster}
          muted
          playsInline
          preload="auto"
          loop
          className="relative z-0 h-full w-full cursor-pointer object-cover"
          onClick={openFullscreen}
        />

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
