"use client";

import type { Opportunity } from "@/app/api/intelligence/trackers/[id]/opportunities/route";

export function OpportunitiesPanel({
  opportunities,
  needsAngles,
  message,
}: {
  opportunities: Opportunity[];
  needsAngles?: boolean;
  message?: string;
}) {
  if (needsAngles) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
        {message ?? "Visit your own trackers first to compute angles before generating opportunities."}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return <p className="text-sm text-white/40">No opportunities found.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {opportunities.map((op, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-white">{op.title}</p>
              <p className="text-xs text-white/60 leading-relaxed">{op.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
