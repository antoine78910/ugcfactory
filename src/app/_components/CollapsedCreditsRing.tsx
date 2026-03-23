"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

type Props = {
  percentRemaining: number;
  /** No subscription pack loaded */
  indeterminate?: boolean;
  /** Low credits warning palette */
  critical?: boolean;
  className?: string;
};

/**
 * Compact circular credits gauge (remaining % as a ring), inspired by Higgsfield-style side nav.
 */
export function CollapsedCreditsRing({ percentRemaining, indeterminate, critical, className }: Props) {
  const rawId = useId();
  const gid = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ""), [rawId]);
  const gradId = `credits-core-${gid}`;
  const size = 44;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 12.5;
  const ringR = 16.75;
  const circ = 2 * Math.PI * ringR;
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, percentRemaining));
  const offset = circ * (1 - pct / 100);
  // Keep collapsed ring on brand palette, even on low-credit state.
  const strokeColor = critical ? "#a855f7" : "#e879f9";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="42%" stopColor="#ddd6fe" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </radialGradient>
      </defs>
      <g transform={`translate(${cx},${cy})`}>
        <g transform="rotate(-90)">
          <circle
            r={ringR}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={2.25}
            strokeLinecap="round"
          />
          {!indeterminate ? (
            <circle
              r={ringR}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeDasharray={`${circ}`}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          ) : null}
        </g>
        <circle r={innerR} fill={`url(#${gradId})`} />
      </g>
    </svg>
  );
}
