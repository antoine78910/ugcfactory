"use client";

import { AlertTriangle } from "lucide-react";

/** Toggle off when Seedance and Link to Ad generation are stable again. */
const SHOW_SEEDANCE_SERVICE_BANNER = true;

export default function SeedanceServiceBanner() {
  if (!SHOW_SEEDANCE_SERVICE_BANNER) return null;

  return (
    <div
      role="status"
      className="dark sticky top-0 z-[60] w-full shrink-0 border-b border-white/10 bg-[#06070d] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_180%_at_0%_-20%,rgba(139,92,246,0.22),transparent_55%),radial-gradient(80%_120%_at_100%_0%,rgba(167,139,250,0.12),transparent_50%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-violet-400/90 via-violet-500/50 to-fuchsia-500/40" aria-hidden />
      <div className="relative flex w-full justify-center px-4 py-2 sm:py-2.5">
        <div className="flex max-w-[19rem] items-center gap-2.5 sm:max-w-[20.5rem] sm:gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/35 bg-violet-500/[0.12] shadow-[0_0_20px_-4px_rgba(139,92,246,0.45)]"
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4 text-violet-200" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[12px] font-semibold leading-snug text-white sm:text-[13px]">
              Link to Ad paused | Seedance 2.0 outage.
            </p>
            <p className="text-[11px] leading-snug text-white/65 sm:text-xs">
              Restoring soon. Thanks for your patience.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
