"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Sparkles, X } from "lucide-react";
import type { TTAd } from "@/lib/intelligenceProvider";
import { AdRecreateDialog } from "./AdRecreateDialog";

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function AdModal({
  ad,
  onClose,
  brandName,
}: {
  ad: TTAd | null;
  onClose: () => void;
  brandName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [recreateOpen, setRecreateOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ad) return;
    if (recreateOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose, recreateOpen]);

  if (!ad) return null;

  const thumbnail = ad.thumbnailUrl ?? ad.previewUrl ?? ad.imageUrl;
  const videoSrc = ad.videoUrl?.trim();
  const hook = ad.headline ?? ad.title ?? "";
  const body = ad.body ?? ad.text ?? "";
  const platform = ad.platform ?? "meta";
  const label = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;

  useEffect(() => {
    if (!ad || recreateOpen) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      v.muted = false;
      v.volume = 1;
      void v.play();
    } catch {
      /* autoplay with sound may be blocked; user can press play */
    }
  }, [ad, recreateOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0912]/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/70 backdrop-blur transition hover:border-violet-400/35 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative aspect-video w-full bg-black">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={thumbnail}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            />
          ) : thumbnail ? (
            <img src={thumbnail} alt={hook} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
              No preview
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-200">
              {label}
            </span>
            {ad.reach && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/60">
                Reach {ad.reach.toLocaleString()}
              </span>
            )}
            {ad.startDate && (
              <span className="text-white/40">First seen {ad.startDate}</span>
            )}
          </div>
          {hook && <p className="text-base font-semibold text-white">{hook}</p>}
          {body && <p className="text-sm leading-relaxed text-white/70">{body}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRecreateOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-400 px-3 py-1.5 text-xs font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 active:translate-y-[2px] active:shadow-none"
            >
              <Sparkles className="h-3 w-3" />
              Recreate with my product
            </button>
            {hook && (
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(hook);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-violet-400/35 hover:text-white"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy hook"}
              </button>
            )}
            {ad.adUrl && (
              <a
                href={ad.adUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-violet-400/35 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
                See the ad
              </a>
            )}
          </div>
        </div>
      </div>

      <AdRecreateDialog
        ad={ad}
        open={recreateOpen}
        onOpenChange={setRecreateOpen}
        brandName={brandName}
      />
    </div>
  );
}
