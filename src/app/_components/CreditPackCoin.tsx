"use client";

import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  className?: string;
};

/**
 * Game-style credit “coin” for pack cards — visually distinct from dollar pricing.
 */
export function CreditPackCoin({ amount, className }: Props) {
  const label = amount.toLocaleString();

  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      aria-label={`${label} credits`}
    >
      {/* Outer rim — metallic */}
      <div
        className={cn(
          "relative flex h-[4.25rem] w-[4.25rem] items-center justify-center sm:h-[4.75rem] sm:w-[4.75rem]",
          "rounded-full",
          "bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-700",
          "p-[3px]",
          "shadow-[0_4px_0_0_rgba(120,53,15,0.55),0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]",
        )}
      >
        {/* Inner face */}
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full",
            "bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600",
            "shadow-[inset_0_-6px_12px_rgba(146,64,14,0.45),inset_0_3px_10px_rgba(255,255,255,0.55)]",
          )}
        >
          {/* Highlight arc */}
          <div
            className="pointer-events-none absolute inset-[12%] rounded-full bg-gradient-to-br from-white/35 via-transparent to-transparent opacity-70"
            aria-hidden
          />
          <span
            className={cn(
              "relative z-[1] px-1 text-center font-black tabular-nums leading-none tracking-tight",
              "text-[1.05rem] text-amber-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]",
              "sm:text-[1.2rem]",
            )}
            style={{ fontFamily: "ui-rounded, system-ui, sans-serif" }}
          >
            {label}
          </span>
        </div>
      </div>
      {/* Soft outer glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full bg-amber-400/15 blur-xl"
        aria-hidden
      />
    </div>
  );
}
