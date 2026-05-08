"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarDays, Coins, Copy, Download, ExternalLink, Eye, Maximize2, Sparkles, Users } from "lucide-react";
import type { TTAd } from "@/lib/intelligenceProvider";
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

function formatUsd(n?: number): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 10) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(1)}`;
}

function MetricPill({
  icon,
  children,
  title,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/85"
    >
      <span className="text-white/55">{icon}</span>
      <span>{children}</span>
    </span>
  );
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
  const [downloadingVideo, setDownloadingVideo] = useState(false);

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

  const openFullscreenVideo = useCallback(async () => {
    if (!videoSrc) return;
    const v = videoRef.current;
    if (!v) {
      onView?.();
      return;
    }
    try {
      if (!document.fullscreenElement && typeof v.requestFullscreen === "function") {
        await v.requestFullscreen();
      } else {
        onView?.();
      }
    } catch {
      onView?.();
    }
  }, [onView, videoSrc]);

  const downloadVideo = useCallback(async () => {
    if (!videoSrc || downloadingVideo) return;
    setDownloadingVideo(true);
    try {
      const a = document.createElement("a");
      a.href = `/api/download?url=${encodeURIComponent(videoSrc)}`;
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloadingVideo(false);
    }
  }, [downloadingVideo, videoSrc]);

  const clickable = typeof onView === "function";
  const showInlineVideo = Boolean(videoSrc && !thumbnail && !videoBroken);
  // When the <video> errors (e.g. image URL, CORS), fall back to <img> using the same URL.
  const brokenVideoFallbackImg = videoBroken && videoSrc && !thumbnail ? videoSrc : null;

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
          ) : showInlineVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 h-full w-full object-cover [&:fullscreen]:object-contain [&:fullscreen]:bg-black"
              muted
              playsInline
              preload="metadata"
              onLoadedData={(e) => {
                setVideoReady(true);
                const v = e.currentTarget;
                try {
                  v.pause();
                  const d = Number(v.duration);
                  v.currentTime = Number.isFinite(d) && d > 0 ? Math.min(0.05, d * 0.01) : 0.001;
                } catch {
                  /* ignore */
                }
              }}
              onError={() => {
                setVideoBroken(true);
                setVideoReady(false);
              }}
            />
          ) : brokenVideoFallbackImg ? (
            <img
              src={brokenVideoFallbackImg}
              alt={ad.headline ?? ad.title ?? "Ad"}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
              No preview
            </div>
          )}
          {videoSrc && playVideoOnHover && !videoBroken && !showInlineVideo ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className={cn(
                "absolute inset-0 h-full w-full object-cover [&:fullscreen]:object-contain [&:fullscreen]:bg-black",
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

          {videoSrc ? (
            <div
              className={cn(
                "absolute top-2 z-20 flex items-center gap-1 transition",
                hoverPlay ? "opacity-100" : "opacity-0",
                typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? "right-10" : "right-2",
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openFullscreenVideo();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/65 text-white/80 shadow-sm backdrop-blur-sm transition hover:bg-black/80 hover:text-white"
                aria-label="Fullscreen video"
                title="Fullscreen video"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void downloadVideo();
                }}
                disabled={downloadingVideo}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/65 text-white/80 shadow-sm backdrop-blur-sm transition hover:bg-black/80 hover:text-white disabled:opacity-45"
                aria-label="Download video"
                title="Download video"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {label}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {typeof ad.impressions === "number" ? (
            <MetricPill
              icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
              title="Impressions"
            >
              {formatReach(ad.impressions)}
            </MetricPill>
          ) : null}
          {typeof ad.reach === "number" ? (
            <MetricPill
              icon={<Users className="h-3.5 w-3.5" aria-hidden />}
              title="Reach"
            >
              {formatReach(ad.reach)}
            </MetricPill>
          ) : null}
          {typeof ad.spend === "number" ? (
            <MetricPill
              icon={<Coins className="h-3.5 w-3.5" aria-hidden />}
              title="Estimated total spend"
            >
              {formatUsd(ad.spend)}
            </MetricPill>
          ) : null}
          {typeof ad.spendPerDay === "number" ? (
            <MetricPill
              icon={<Coins className="h-3.5 w-3.5" aria-hidden />}
              title="Estimated spend per day"
            >
              {formatUsd(ad.spendPerDay)}/d
            </MetricPill>
          ) : null}
          {typeof ad.daysRunning === "number" ? (
            <MetricPill
              icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
              title="Days running"
            >
              {ad.daysRunning}d
            </MetricPill>
          ) : null}
          {typeof ad.duplicates === "number" ? (
            <MetricPill
              icon={<Copy className="h-3.5 w-3.5" aria-hidden />}
              title="Duplicate creatives"
            >
              {ad.duplicates}
            </MetricPill>
          ) : null}
        </div>

        <p className="line-clamp-2 text-xs text-white/75">
          {ad.headline ?? ad.title ?? ad.body ?? "—"}
        </p>

        <div className="flex items-center justify-between gap-2 text-[11px] text-white/45">
          <span className="min-w-0 truncate">{date ?? ""}</span>
          <div className="flex items-center gap-1.5">
            {ad.adUrl ? (
              <a
                href={ad.adUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/85 transition hover:bg-white/[0.1]"
              >
                <ExternalLink className="h-3 w-3" />
                See the ad
              </a>
            ) : null}
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
      </div>

      {showRecreateShortcut ? (
        <AdRecreateDialog ad={ad} open={recreateOpen} onOpenChange={setRecreateOpen} brandName={brandName} />
      ) : null}
    </div>
  );
}
