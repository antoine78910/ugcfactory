"use client";

import type { Angle } from "@/app/api/intelligence/trackers/[id]/angles/route";

export function AnglesChart({ angles }: { angles: Angle[] }) {
  if (angles.length === 0) {
    return <p className="text-sm text-white/40">No angles data.</p>;
  }

  const sorted = [...angles].sort((a, b) => b.pct - a.pct);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((a) => (
        <div key={a.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-sm text-white/70 truncate">{a.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-700"
              style={{ width: `${a.pct}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs text-white/50">{a.pct}%</span>
        </div>
      ))}
    </div>
  );
}
