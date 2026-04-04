"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type AccountPlanId,
  useCreditsPlan,
} from "@/app/_components/CreditsPlanContext";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { openStripeBillingPortal } from "@/lib/stripe/openBillingPortalClient";

function UpgradeModal({
  currentPlanId,
  onClose,
  onSelectPlan,
}: {
  currentPlanId: AccountPlanId;
  onClose: () => void;
  onSelectPlan: (id: SubscriptionPlanId) => void | Promise<void>;
}) {
  const { subscriptionTiers: PLANS } = useCreditsPlan();
  const currentIdx =
    currentPlanId === "free" ? -1 : PLANS.findIndex((p) => p.id === currentPlanId);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a10] p-6 shadow-[0_0_80px_rgba(139,92,246,0.15)] sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Upgrade your plan</h2>
          <p className="mt-1 text-sm text-white/50">
            Get more credits, unlock premium models, and scale your content.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => {
            const isCurrent = currentPlanId !== "free" && plan.id === currentPlanId;
            const isUpgrade = currentPlanId === "free" || i > currentIdx;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-5 transition-all",
                  plan.cardBorder,
                  isCurrent ? "bg-white/[0.04] ring-1 ring-violet-400/40" : "bg-white/[0.02]",
                )}
              >
                {"popular" in plan && plan.popular ? (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-sky-400/40 bg-sky-500/20 px-3 py-0.5 text-[10px] font-bold tracking-wide text-sky-200">
                    MOST POPULAR
                  </span>
                ) : null}

                <h3 className="mt-1 text-lg font-bold text-white">{plan.name}</h3>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">${plan.monthly}</span>
                  <span className="text-sm text-white/45">/mo</span>
                </div>

                <p className="mt-2 text-sm font-semibold text-white">{plan.credits.toLocaleString()} credits</p>

                <ul className="mt-4 flex-1 space-y-2 text-xs text-white/70">
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {plan.usage.linkToAd} Link to Ad
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {Number(plan.usage.images).toLocaleString()} images
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {Number(plan.usage.videos).toLocaleString()} videos
                  </li>
                </ul>

                <button
                  type="button"
                  disabled={!isUpgrade}
                  onClick={() => onSelectPlan(plan.id)}
                  className={cn(
                    "mt-5 h-10 w-full rounded-xl text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-40",
                    isUpgrade ? plan.btnClass : "bg-white/10 text-white/50",
                  )}
                >
                  {isCurrent ? "Current plan" : isUpgrade ? "Upgrade" : "…"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-center text-xs text-white/35">
          Or buy one-off credit packs on the{" "}
          <Link href="/credits" onClick={onClose} className="text-violet-300 underline-offset-2 hover:underline">
            Credits
          </Link>{" "}
          page.
        </p>
      </div>
    </div>
  );
}

export default function CreditLowBanner() {
  const { current, total, planId, setSubscriptionPlan } = useCreditsPlan();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const pct = total > 0 ? ((total - current) / total) * 100 : 0;
  const isLow = total > 0 && pct >= 90;

  const bannerVisible = isLow && !dismissed;

  const progressLabel = useMemo(() => {
    if (total <= 0) return "";
    if (pct >= 100) return "All credits used";
    return `Over ${Math.floor(pct / 10) * 10}% already used`;
  }, [pct, total]);

  if (!bannerVisible && !showModal) return null;

  return (
    <>
      {bannerVisible ? (
        <div className="fixed bottom-20 right-5 z-[250] flex max-w-[min(480px,calc(100vw-2.5rem))] items-center gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-600/15 via-[#141414] to-[#141414] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <Zap className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-medium text-white">
            <span className="font-bold">Credits are running low!</span>{" "}
            <span className="text-white/65">{progressLabel}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
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
      ) : null}

      {showModal ? (
        <UpgradeModal
          currentPlanId={planId}
          onClose={() => setShowModal(false)}
          onSelectPlan={async (id) => {
            if (planId !== "free") {
              try {
                await openStripeBillingPortal();
                setShowModal(false);
                setDismissed(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not open billing portal");
              }
              return;
            }
            setSubscriptionPlan(id);
            setShowModal(false);
            setDismissed(false);
          }}
        />
      ) : null}
    </>
  );
}
