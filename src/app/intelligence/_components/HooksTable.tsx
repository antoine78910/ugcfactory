"use client";

import { useMemo, useState } from "react";
import { Copy, Download } from "lucide-react";
import type { TTAd } from "@/lib/intelligenceProvider";

function formatReach(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function csvEscape(s: string): string {
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function HooksTable({ ads, brandSlug }: { ads: TTAd[]; brandSlug?: string }) {
  const hooks = useMemo(
    () =>
      ads
        .map((ad) => ({
          hook: ad.headline ?? ad.title ?? ad.body?.slice(0, 120) ?? "",
          platform: ad.platform ?? "meta",
          reach: ad.reach,
          firstSeen: ad.startDate ?? ad.firstSeen ?? "",
        }))
        .filter((h) => h.hook)
        .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0)),
    [ads]
  );

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (hooks.length === 0) return <p className="text-sm text-white/40">No hooks found.</p>;

  function exportCsv() {
    const header = ["hook", "platform", "reach", "first_seen"];
    const rows = hooks.map((h) =>
      [csvEscape(h.hook), csvEscape(h.platform), String(h.reach ?? ""), csvEscape(h.firstSeen)].join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `hooks-${brandSlug ?? "brand"}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-violet-400/35 hover:text-white"
        >
          <Download className="h-3 w-3" />
          Export CSV
        </button>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40">
              <th className="pb-2 pr-4 font-normal">Hook</th>
              <th className="pb-2 pr-4 font-normal">Platform</th>
              <th className="pb-2 pr-4 font-normal text-right">Reach</th>
              <th className="pb-2 font-normal text-right" />
            </tr>
          </thead>
          <tbody>
            {hooks.map((h, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-4 text-white/75 max-w-xs">
                  <span className="line-clamp-2">{h.hook}</span>
                </td>
                <td className="py-2 pr-4 text-white/50 capitalize">{h.platform}</td>
                <td className="py-2 pr-4 text-right text-white/70">{formatReach(h.reach)}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(h.hook);
                      setCopiedIdx(i);
                      window.setTimeout(
                        () => setCopiedIdx((cur) => (cur === i ? null : cur)),
                        1200
                      );
                    }}
                    className="rounded-md p-1 text-white/40 transition hover:bg-white/5 hover:text-violet-200"
                    title="Copy hook"
                  >
                    {copiedIdx === i ? (
                      <span className="text-[11px] text-violet-200">✓</span>
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
