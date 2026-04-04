"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small pill: amount + credits coin icon (replaces raw “12 cr” copy). */
export function CreditCostBadge({
  amount,
  className,
  iconClassName,
}: {
  amount: number;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-violet-400/20 px-1.5 py-px text-[10px] font-bold tabular-nums text-violet-300/90",
        className,
      )}
      title="credits"
    >
      {amount}
      <Coins className={cn("h-2.5 w-2.5 shrink-0 text-violet-300/90", iconClassName)} aria-hidden />
    </span>
  );
}
