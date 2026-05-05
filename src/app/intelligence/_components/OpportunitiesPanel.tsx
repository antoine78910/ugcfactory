"use client";

import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
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
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

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
          key={`${op.title}-${i}`}
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
            <div className="mt-1 flex items-start gap-2 rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-2">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-300" />
              <p className="flex-1 text-[11px] leading-relaxed text-violet-100/85">{op.brief}</p>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(op.brief ?? "");
                  setCopiedIdx(i);
                  window.setTimeout(
                    () => setCopiedIdx((cur) => (cur === i ? null : cur)),
                    1200
                  );
                }}
                className="shrink-0 rounded-md p-1 text-violet-200/60 transition hover:bg-violet-500/10 hover:text-violet-100"
                title="Copy brief to clipboard"
              >
                {copiedIdx === i ? (
                  <span className="text-[10px] text-violet-200">✓</span>
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
