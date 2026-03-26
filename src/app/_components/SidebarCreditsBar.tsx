"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { CollapsedCreditsRing } from "@/app/_components/CollapsedCreditsRing";
import { cn } from "@/lib/utils";

/** Same rule as CreditLowBanner: ≥90% consumed → ≤10% remaining */
function isCreditsCriticallyLow(total: number, percentRemaining: number): boolean {
  return total > 0 && percentRemaining <= 10;
}

type SidebarCreditsBarProps = {
  /** Narrow sidebar: icon + compact meter only. */
  collapsed?: boolean;
};

export default function SidebarCreditsBar({ collapsed = false }: SidebarCreditsBarProps) {
  const { current, total, percentRemaining } = useCreditsPlan();

  const fillPct = total > 0 ? percentRemaining : 0;
  const showCta = isCreditsCriticallyLow(total, percentRemaining);

  if (collapsed) {
    const indeterminate = total <= 0;
    return (
      <Link
        href="/credits"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0b0912]/90 transition-opacity hover:opacity-95"
        title={`Credits: ${current.toLocaleString()}${total > 0 ? ` · ${percentRemaining}% left` : ""}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : fillPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          indeterminate
            ? "Credits: add a pack"
            : `Credits remaining: ${percentRemaining} percent`
        }
      >
        <CollapsedCreditsRing
          percentRemaining={percentRemaining}
          indeterminate={indeterminate}
          critical={showCta}
        />
        <span
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center pt-px text-[10px] font-bold tabular-nums leading-none text-zinc-800/90",
            percentRemaining >= 100 && "text-[9px]",
          )}
        >
          {indeterminate ? (
            <span className="text-[11px] font-semibold text-zinc-600/80">—</span>
          ) : (
            <>
              {percentRemaining}
              <span className="text-[8px] font-bold text-zinc-600/75">%</span>
            </>
          )}
        </span>
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0912]/85 p-2">
      <Link
        href="/credits"
        className="group flex flex-col gap-1.5 transition-opacity hover:opacity-95"
        title="Buy credits"
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
            <Coins className="h-3 w-3 text-violet-400/90" aria-hidden />
            Credits
          </span>
          <span
            className={cn(
              "text-[11px] font-bold tabular-nums leading-none",
              showCta ? "text-rose-200/80" : "text-white/90",
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
          className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
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
                ? "bg-gradient-to-r from-violet-500 to-rose-400"
                : "bg-gradient-to-r from-violet-500 to-fuchsia-500",
            )}
            style={{ width: `${fillPct}%` }}
          />
        </div>

        <p className="text-[10px] tabular-nums leading-tight text-white/45">
          <span className="font-semibold text-white/70">{current.toLocaleString()}</span>
          {total > 0 ? (
            <>
              {" "}
              / {total.toLocaleString()}
            </>
          ) : (
            <span className="text-white/35"> · pack</span>
          )}
        </p>
      </Link>

      {showCta ? (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-white/10 pt-1.5">
          <p className="text-[9px] font-medium leading-snug text-rose-200/70">
            Low balance — top up or upgrade.
          </p>
          <div className="flex gap-1.5">
            <Link
              href="/subscription"
              className="flex-1 rounded-md bg-violet-500 py-1 text-center text-[10px] font-bold text-white transition hover:bg-violet-400"
            >
              Upgrade
            </Link>
            <Link
              href="/credits"
              className="flex-1 rounded-md border border-white/20 bg-white/5 py-1 text-center text-[10px] font-semibold text-white transition hover:bg-white/10"
            >
              Credits
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
