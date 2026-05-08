"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";

type Usage = { remaining?: number; used?: number; plan?: string };

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return String(n);
}

function tone(remaining: number): { ring: string; text: string; bg: string } {
  if (remaining > 5_000)
    return {
      ring: "border-violet-300/35",
      text: "text-violet-100",
      bg: "bg-violet-500/15",
    };
  if (remaining > 1_000)
    return {
      ring: "border-amber-300/35",
      text: "text-amber-100",
      bg: "bg-amber-500/15",
    };
  return {
    ring: "border-rose-300/35",
    text: "text-rose-100",
    bg: "bg-rose-500/15",
  };
}

export function CreditsChip() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/usage")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "remaining" in data) {
          setUsage(data as Usage);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !usage || typeof usage.remaining !== "number") return null;
  const t = tone(usage.remaining);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${t.ring} ${t.bg} ${t.text}`}
      title={`Remaining data credits${usage.plan ? ` · ${usage.plan}` : ""}`}
    >
      <CircleDollarSign className="h-3 w-3" aria-hidden />
      {formatCredits(usage.remaining)} credits
    </span>
  );
}
