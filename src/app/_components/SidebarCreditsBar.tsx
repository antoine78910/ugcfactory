"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { cn } from "@/lib/utils";

/** Same rule as CreditLowBanner: ≥90% consumed → ≤10% remaining */
function isCreditsCriticallyLow(total: number, percentRemaining: number): boolean {
  return total > 0 && percentRemaining <= 10;
}

export default function SidebarCreditsBar() {
  const { current, total, percentRemaining } = useCreditsPlan();

  const fillPct = total > 0 ? percentRemaining : 0;
  const showCta = isCreditsCriticallyLow(total, percentRemaining);

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
          <span
            className={cn(
              "text-xs font-bold tabular-nums",
              showCta ? "text-amber-200" : "text-white/90",
            )}
          >
            {total > 0 ? (
              <>
                {percentRemaining}% <span className="font-medium text-white/45">left</span>
              </>
            ) : (
              <span className="text-white/45">…</span>
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
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
              showCta
                ? "bg-gradient-to-r from-amber-500 to-orange-500"
                : "bg-gradient-to-r from-violet-500 to-fuchsia-500",
            )}
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

      {showCta ? (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
          <p className="text-[10px] font-medium leading-snug text-amber-200/90">
            Running low? Top up or upgrade your plan.
          </p>
          <div className="flex gap-2">
            <Link
              href="/subscription"
              className="flex-1 rounded-lg bg-yellow-400 py-1.5 text-center text-[11px] font-bold text-black transition hover:bg-yellow-300"
            >
              Upgrade
            </Link>
            <Link
              href="/credits"
              className="flex-1 rounded-lg border border-white/20 bg-white/5 py-1.5 text-center text-[11px] font-semibold text-white transition hover:bg-white/10"
            >
              Get credits
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
