"use client";

import type { TTAd } from "@/lib/trendtrack";

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function HooksTable({ ads }: { ads: TTAd[] }) {
  const hooks = ads
    .map((ad) => ({
      hook: ad.headline ?? ad.title ?? ad.body?.slice(0, 120) ?? "",
      platform: ad.platform ?? "meta",
      reach: ad.reach,
    }))
    .filter((h) => h.hook)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  if (hooks.length === 0) {
    return <p className="text-sm text-white/40">No hooks found.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-white/40">
            <th className="pb-2 pr-4 font-normal">Hook</th>
            <th className="pb-2 pr-4 font-normal">Platform</th>
            <th className="pb-2 font-normal text-right">Reach</th>
          </tr>
        </thead>
        <tbody>
          {hooks.map((h, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              <td className="py-2 pr-4 text-white/70 max-w-xs">
                <span className="line-clamp-2">{h.hook}</span>
              </td>
              <td className="py-2 pr-4 text-white/50 capitalize">{h.platform}</td>
              <td className="py-2 text-right text-white/70">{formatReach(h.reach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
