"use client";

import { useEffect, useState } from "react";

export function WelcomeOverlay({
  storageKey = "intelligence:welcomeSeen",
  durationMs = 1100,
  onDone,
}: {
  storageKey?: string;
  durationMs?: number;
  onDone?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = sessionStorage.getItem(storageKey) === "1";
      if (seen) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // non-fatal: still show once
    }

    setVisible(true);
    const tid = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, durationMs);
    return () => window.clearTimeout(tid);
  }, [durationMs, onDone, storageKey]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[min(680px,92vw)] overflow-hidden rounded-3xl border border-white/10 bg-[#0b0912]/80 p-10 shadow-2xl">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-2xl" />
        </div>

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-violet-100">
            Intelligence
            <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.9)]" />
          </div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">
            Welcome to Intelligence
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
            Find what&apos;s working for your closest competitors — then recreate the winning angles with
            your product.
          </p>

          <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-violet-400"
              style={{ animation: `intelWelcomeBar ${Math.max(300, durationMs)}ms linear both` }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes intelWelcomeBar {
          from { width: 0%; opacity: 0.85; }
          to { width: 100%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

