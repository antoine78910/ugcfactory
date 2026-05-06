"use client";

import { useCallback, useRef, useState } from "react";
import { Maximize2, Sparkles } from "lucide-react";
import type { TTAd } from "@/lib/trendtrack";
import { AdRecreateDialog } from "./AdRecreateDialog";
import { cn } from "@/lib/utils";

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  tiktok: "TikTok",
};

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function AdCard({
  ad,
  onView,
  playVideoOnHover = false,
  showRecreateShortcut = false,
  brandName,
}: {
  ad: TTAd;
  onView?: () => void;
  /** Hover plays `ad.videoUrl` when present (e.g. Meta creative). */
  playVideoOnHover?: boolean;
  /** Inline button opening the same recreate flow as the detail modal. */
  showRecreateShortcut?: boolean;
  brandName?: string;
}) {
  const thumbnail = ad.thumbnailUrl ?? ad.previewUrl ?? ad.imageUrl;
  const videoSrc = ad.videoUrl?.trim();
  const platform = ad.platform ?? "meta";
  const label = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
  const date = ad.startDate ?? ad.firstSeen;
  const rank = ad.rank;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hoverPlay, setHoverPlay] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [recreateOpen, setRecreateOpen] = useState(false);

  const stopVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  const maybePlay = useCallback(async () => {
    if (!playVideoOnHover || !videoSrc || videoBroken) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
    } catch {
      /* autoplay quirks */
    }
  }, [playVideoOnHover, videoSrc, videoBroken]);

  const onMediaEnter = useCallback(() => {
    setHoverPlay(true);
    void maybePlay();
  }, [maybePlay]);

  const onMediaLeave = useCallback(() => {
    setHoverPlay(false);
    stopVideo();
  }, [stopVideo]);

  const clickable = typeof onView === "function";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-sm transition",
        clickable &&
          "group hover:border-violet-500/40 hover:bg-white/[0.07] hover:shadow-[0_0_22px_rgba(139,92,246,0.18)]",
      )}
    >
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={() => clickable && onView()}
        onKeyDown={(e) => {
          if (!clickable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onView();
          }
        }}
        className={cn("flex flex-col gap-2 outline-none", clickable && "cursor-pointer")}
      >
        <div
          className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/5"
          onMouseEnter={onMediaEnter}
          onMouseLeave={onMediaLeave}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={ad.headline ?? ad.title ?? "Ad"}
              className={cn(
                "h-full w-full object-cover transition-transform duration-300",
                clickable && "group-hover:scale-[1.02]",
                // Keep the existing thumb visible until the video is actually ready (avoid blank flashes).
                videoSrc && playVideoOnHover && hoverPlay && !videoBroken && videoReady && "opacity-0",
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
              No preview
            </div>
          )}
          {videoSrc && playVideoOnHover && !videoBroken ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className={cn(
                "absolute inset-0 h-full w-full object-cover",
                hoverPlay ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              muted
              playsInline
              loop
              preload="none"
              onLoadedData={() => setVideoReady(true)}
              onError={() => {
                setVideoBroken(true);
                setVideoReady(false);
              }}
            />
          ) : null}
          {typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? (
            <span className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur">
              #{rank}
            </span>
          ) : null}

          {clickable && videoSrc ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onView?.();
              }}
              className={cn(
                "absolute top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/65 text-white/80 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-black/80 hover:text-white group-hover:opacity-100",
                typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? "right-10" : "right-2",
              )}
              aria-label="Fullscreen video"
              title="Fullscreen video"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}

          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {label}
          </span>
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {formatReach(ad.reach)}
          </span>
        </div>

        <p className="line-clamp-2 text-xs text-white/75">
          {ad.headline ?? ad.title ?? ad.body ?? "—"}
        </p>

        <div className="flex items-center justify-between gap-2 text-[11px] text-white/45">
          <span className="min-w-0 truncate">{date ?? ""}</span>
          {showRecreateShortcut ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setRecreateOpen(true);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-400/35 bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/18"
            >
              <Sparkles className="h-3 w-3" />
              Recreate
            </button>
          ) : null}
        </div>
      </div>

      {showRecreateShortcut ? (
        <AdRecreateDialog ad={ad} open={recreateOpen} onOpenChange={setRecreateOpen} brandName={brandName} />
      ) : null}
    </div>
  );
}
