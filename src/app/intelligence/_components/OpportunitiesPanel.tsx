"use client";

import { Sparkles } from "lucide-react";
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
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        {message ?? "Visit your own trackers first to compute angles before generating opportunities."}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return <p className="text-sm text-white/40">No opportunities found.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {opportunities.map((op, i) => (
        <article
          key={i}
          className="relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-violet-400/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-200">
              {i + 1}
            </span>
            <h4 className="text-sm font-semibold text-white">{op.title}</h4>
          </div>
          <p className="text-xs leading-relaxed text-white/65">{op.description}</p>
          {op.brief && (
            <a
              href={`/ads-studio?prefill=${encodeURIComponent(op.brief)}`}
              className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Sparkles className="h-3 w-3" />
              Use in Ads Studio
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
