"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Zap } from "lucide-react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";

export default function CreditLowBanner() {
  const router = useRouter();
  const { current, total } = useCreditsPlan();
  const [dismissed, setDismissed] = useState(false);

  const pct = total > 0 ? ((total - current) / total) * 100 : 0;
  const isLow = total > 0 && pct >= 90;

  const bannerVisible = isLow && !dismissed;

  const progressLabel = useMemo(() => {
    if (total <= 0) return "";
    if (pct >= 100) return "All credits used";
    return `Over ${Math.floor(pct / 10) * 10}% already used`;
  }, [pct, total]);

  if (!bannerVisible) return null;

  return (
    <div className="fixed bottom-20 right-5 z-[250] flex max-w-[min(480px,calc(100vw-2.5rem))] items-center gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-600/15 via-[#141414] to-[#141414] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
      <Zap className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium text-white">
        <span className="font-bold">Credits are running low!</span>{" "}
        <span className="text-white/65">{progressLabel}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          router.push("/subscription");
        }}
        className="shrink-0 rounded-lg bg-violet-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-violet-400"
      >
        Upgrade
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-white/40 transition hover:text-white/70"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
