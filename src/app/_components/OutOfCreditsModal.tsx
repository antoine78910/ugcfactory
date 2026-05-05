"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap, X } from "lucide-react";
import { OUT_OF_CREDITS_EVENT, type OutOfCreditsDetail } from "@/lib/guardedFetch";

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2, pro: 3, scale: 4 };

function nextPlanLabel(planId: string): string | null {
  const r = PLAN_RANK[planId] ?? 0;
  if (r >= 4) return null;
  const next = (Object.entries(PLAN_RANK).find(([, v]) => v === r + 1) ?? [])[0];
  if (!next) return null;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

export default function OutOfCreditsModal() {
  const [detail, setDetail] = useState<OutOfCreditsDetail | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<OutOfCreditsDetail>;
      if (ce.detail) setDetail(ce.detail);
    }
    window.addEventListener(OUT_OF_CREDITS_EVENT, handler as EventListener);
    return () => window.removeEventListener(OUT_OF_CREDITS_EVENT, handler as EventListener);
  }, []);

  const close = useCallback(() => setDetail(null), []);

  if (!detail) return null;

  const isFree = detail.planId === "free";
  const upgradeLabel = nextPlanLabel(detail.planId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={close}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0912] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Crédits insuffisants</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Cette génération coûte{" "}
              <span className="font-semibold text-white">{detail.need}</span> crédits, il t&apos;en reste{" "}
              <span className="font-semibold text-white">{detail.have}</span>.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(isFree || upgradeLabel) && (
            <Link
              href="/pricing"
              onClick={close}
              className="flex flex-col items-start gap-1 rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 text-left transition hover:border-violet-400 hover:bg-violet-500/15"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                {isFree ? "Plans payants" : `Upgrade vers ${upgradeLabel}`}
              </span>
              <span className="text-sm text-white/85">
                {isFree ? "Voir les plans et débloquer plus de crédits/mois" : `Plus de crédits/mois sur ${upgradeLabel}`}
              </span>
            </Link>
          )}
          <Link
            href="/credits"
            onClick={close}
            className="flex flex-col items-start gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-left transition hover:border-amber-400 hover:bg-amber-500/15"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Achat ponctuel</span>
            <span className="text-sm text-white/85">Acheter un pack de crédits</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
