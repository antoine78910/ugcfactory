"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type VideoCardProps = {
  src: string;
  poster?: string;
  className?: string;
  aspectClassName?: string;
};

export default function VideoCard({ src, poster, className, aspectClassName = "aspect-[9/16]" }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const handleMouseEnter = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }, []);

  const handleMouseLeave = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
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
          src={src}
          poster={poster}
          muted
          playsInline
          preload="metadata"
          loop
          className="h-full w-full cursor-pointer object-cover"
          onClick={() => setLightbox(true)}
        />

        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="absolute inset-0 z-10 cursor-pointer"
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
          onClick={() => setLightbox(true)}
          className="absolute bottom-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/vc:opacity-100 focus-visible:opacity-100"
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {lightbox ? (
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
              src={src}
              controls
              autoPlay
              playsInline
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
