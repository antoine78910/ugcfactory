"use client";

import { Check, Coins, Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  planRank,
  SUBSCRIPTION_MODEL_MATRIX_ROWS,
  type AccountPlanId,
} from "@/lib/subscriptionModelAccess";
import { subscriptionPlanSortIndex, type SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { subscriptionBonusCreditsVsStarter } from "@/lib/pricing";
import {
  upToEstimateAiImagesFromCredits,
  upToEstimateAiVideosFromCredits,
} from "@/lib/billing/creditUsageEstimates";

function isModelIncluded(planIdRaw: string, row: (typeof SUBSCRIPTION_MODEL_MATRIX_ROWS)[number]): boolean {
  const planId = (planIdRaw === "free" ? "free" : planIdRaw) as AccountPlanId;
  const r = planRank(planId);
  const idx = Math.max(0, Math.min(3, r - 1));
  return row.tiers[idx];
}

function starterBonusForPlan(planId: SubscriptionPlanId, credits: number): { bonus: number; baseCredits: number } {
  const tierIdx = subscriptionPlanSortIndex(planId);
  const bonusCtx =
    tierIdx >= 1 && tierIdx <= 3 ? subscriptionBonusCreditsVsStarter(tierIdx as 1 | 2 | 3) : null;
  const bonus = bonusCtx ? Math.max(0, Math.round(bonusCtx.bonusCredits)) : 0;
  const baseCredits = bonus > 0 ? Math.max(0, credits - bonus) : credits;
  return { bonus, baseCredits };
}

/**
 * One-line credits: base (total minus Starter-tier bonus) + gift pill for the bonus.
 * Used on plan cards, upgrade/downgrade dialogs, and the first row of `SubscriptionPlanFeatureList`.
 */
const CREDITS_LINE_CLASS = "text-sm font-semibold tabular-nums leading-snug";

export function SubscriptionPlanCreditsWithBonus({
  planId,
  credits,
  showCoins = true,
}: {
  planId: SubscriptionPlanId;
  credits: number;
  /** Ignored: bonus line uses the same size as base credits (kept for existing call sites). */
  compact?: boolean;
  showCoins?: boolean;
}) {
  const { bonus, baseCredits } = starterBonusForPlan(planId, credits);

  const pill = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/40",
        "bg-gradient-to-r from-amber-500/25 via-amber-400/15 to-emerald-500/20",
        CREDITS_LINE_CLASS,
        "text-amber-100",
        "px-2.5 py-1 shadow-[0_0_14px_rgba(251,191,36,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]",
      )}
      title={`${credits.toLocaleString()} credits/mo total (${baseCredits.toLocaleString()} at Starter-tier value + ${bonus.toLocaleString()} bonus)`}
      aria-label={`Bonus ${bonus} credits per month. ${credits.toLocaleString()} credits per month total.`}
    >
      <Gift className="h-4 w-4 shrink-0 text-amber-200/95" strokeWidth={2.25} aria-hidden />
      +{bonus.toLocaleString()} credits
    </span>
  );

  const baseLabel = (
    <span className={cn("shrink-0 text-white", CREDITS_LINE_CLASS)}>{baseCredits.toLocaleString()} credits</span>
  );

  const textRow = (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2 whitespace-nowrap",
        showCoins ? "min-w-0 flex-1" : "inline-flex max-w-full",
      )}
    >
      {baseLabel}
      {bonus > 0 ? pill : null}
    </span>
  );

  if (!showCoins) {
    return textRow;
  }

  return (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-200">
        <Coins className="h-4 w-4" aria-hidden />
      </span>
      {textRow}
    </>
  );
}

export function SubscriptionPlanFeatureList({
  planId,
  credits,
  className,
}: {
  planId: SubscriptionPlanId;
  credits: number;
  className?: string;
}) {
  const images = Number(upToEstimateAiImagesFromCredits(credits));
  const videos = Number(upToEstimateAiVideosFromCredits(credits));

  return (
    <ul
      className={cn(
        "mt-4 flex min-h-0 flex-1 flex-col space-y-2 border-t border-white/10 pt-4 text-left text-xs text-white/72",
        className,
      )}
    >
      <li className="flex items-center gap-2.5">
        <SubscriptionPlanCreditsWithBonus planId={planId} credits={credits} />
      </li>
      <li className="pl-1 text-white/50">Up to {images.toLocaleString()} AI images (Nanobanana)</li>
      <li className="pl-1 text-white/50">Up to {videos.toLocaleString()} AI videos (Sora 2)</li>
      <li className="pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">Included models</li>
      <li className="pl-1 text-white/55">
        <div className="space-y-1.5">
          {SUBSCRIPTION_MODEL_MATRIX_ROWS.map((row) => {
            const included = isModelIncluded(planId, row);
            return (
              <div key={row.label} className="flex items-center gap-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-5 w-5 flex-none shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold",
                      included
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                        : "border-red-400/30 bg-red-500/10 text-red-200/90",
                    )}
                    aria-label={included ? "Included" : "Not included"}
                  >
                    {included ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 truncate text-xs text-white/70" title={row.label}>
                    {row.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </li>
    </ul>
  );
}
