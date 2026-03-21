"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";

export default function SidebarCreditsBar() {
  const { current, total, percentRemaining } = useCreditsPlan();

  const fillPct = total > 0 ? percentRemaining : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0912]/90 px-3 py-2.5">
      <Link
        href="/credits"
        className="group flex flex-col gap-2 transition-opacity hover:opacity-95"
        title="Buy credits"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
            <Coins className="h-3.5 w-3.5 text-violet-400/90" aria-hidden />
            Credits
          </span>
          <span className="text-xs font-bold tabular-nums text-white/90">
            {total > 0 ? (
              <>
                {percentRemaining}% <span className="font-medium text-white/45">left</span>
              </>
            ) : (
              <span className="text-white/45">—</span>
            )}
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={fillPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Credits remaining: ${percentRemaining} percent`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-300 ease-out"
            style={{ width: `${fillPct}%` }}
          />
        </div>

        <p className="text-[11px] tabular-nums text-white/45">
          <span className="font-semibold text-white/70">{current.toLocaleString()}</span>
          {total > 0 ? (
            <>
              {" "}
              / {total.toLocaleString()}
            </>
          ) : (
            <span className="text-white/35"> · add a pack</span>
          )}
        </p>
      </Link>
    </div>
  );
}
