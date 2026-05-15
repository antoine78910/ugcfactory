"use client";

import type { AngleScore } from "@/lib/brandProjectInsights";

export function InsightsAngleChart({
  angles,
  emptyLabel = "No angle data yet.",
}: {
  angles: AngleScore[];
  emptyLabel?: string;
}) {
  if (angles.length === 0) {
    return <p className="text-sm text-white/40">{emptyLabel}</p>;
  }

  const maxPct = Math.max(...angles.map((a) => a.pct), 1);

  return (
    <div className="flex flex-col gap-3">
      {angles.map((a) => (
        <div key={a.label} className="group">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-white/85">{a.label}</span>
            <span className="shrink-0 tabular-nums text-white/45">
              {a.pct}% · {a.adCount} ad{a.adCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300 transition-all duration-700"
              style={{ width: `${Math.max(4, (a.pct / maxPct) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
