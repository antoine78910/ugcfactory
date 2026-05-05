"use client";

import type { TTAd } from "@/lib/trendtrack";

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

export function AdCard({ ad, onView }: { ad: TTAd; onView?: () => void }) {
  const thumbnail = ad.thumbnailUrl ?? ad.previewUrl ?? ad.imageUrl;
  const platform = ad.platform ?? "meta";
  const label = PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
  const date = ad.startDate ?? ad.firstSeen;

  return (
    <div className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition hover:border-violet-500/40 hover:bg-white/10">
      {thumbnail ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/5">
          <img
            src={thumbnail}
            alt={ad.headline ?? ad.title ?? "Ad"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-white/5 text-xs text-white/30">
          No preview
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-300">
          {label}
        </span>
        <span className="text-xs text-white/40">{date ?? ""}</span>
      </div>

      <p className="line-clamp-2 text-xs text-white/70">
        {ad.headline ?? ad.title ?? ad.body ?? "—"}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">
          Reach: <span className="text-white/70">{formatReach(ad.reach)}</span>
        </span>
        {ad.adUrl && (
          <a
            href={ad.adUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 hover:underline"
          >
            View →
          </a>
        )}
      </div>
    </div>
  );
}
