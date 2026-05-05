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
  const rank = (ad as TTAd & { rank?: number }).rank;

  const Wrapper = onView ? "button" : "div";
  return (
    <Wrapper
      onClick={onView}
      className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-sm transition hover:border-violet-500/40 hover:bg-white/[0.07] hover:shadow-[0_0_22px_rgba(139,92,246,0.18)]"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/5">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={ad.headline ?? ad.title ?? "Ad"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
            No preview
          </div>
        )}
        {typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? (
          <span className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur">
            #{rank}
          </span>
        ) : null}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
          {label}
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
          {formatReach(ad.reach)}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-white/75">
        {ad.headline ?? ad.title ?? ad.body ?? "—"}
      </p>

      <div className="text-[11px] text-white/45">
        <span>{date ?? ""}</span>
      </div>
    </Wrapper>
  );
}
