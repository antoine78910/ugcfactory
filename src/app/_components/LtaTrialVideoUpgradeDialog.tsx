"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Dialog } from "radix-ui";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { formatDisplayCredits } from "@/lib/creditLedgerTicks";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import { useBillingDisplayPrices } from "@/lib/billing/useBillingDisplayPrices";
import { cn } from "@/lib/utils";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { Button } from "@/components/ui/button";
import { SubscriptionPlanFeatureList } from "@/app/_components/SubscriptionPlanFeatureList";

const PLAN_ROWS: {
  id: SubscriptionPlanId;
  name: string;
  description: string;
  badge?: string;
  highlight?: boolean;
}[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Learn the workflow and launch your first campaigns.",
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Popular",
    description: "The plan most teams pick once content is weekly.",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Scale creatives without hitting limits every few days.",
  },
  {
    id: "scale",
    name: "Scale",
    description: "Agencies and brands running multiple products at once.",
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits: number;
  requiredCredits: number;
};

/**
 * Trial Link to Ad: insufficient credits on final video render.
 * Same plan grid + feature bullets as `/subscription` (monthly prices, IP-cached).
 */
export function LtaTrialVideoUpgradeDialog({
  open,
  onOpenChange,
  currentCredits,
  requiredCredits,
}: Props) {
  const displayPrices = useBillingDisplayPrices();
  const currency = displayPrices?.currency ?? "usd";
  const shortfall = Math.max(0, requiredCredits - currentCredits);
  const billingPricesReady = displayPrices !== null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[221] -translate-x-1/2 -translate-y-1/2 outline-none",
            "w-[min(98vw,1280px)] max-h-[min(92vh,900px)] overflow-y-auto",
            "rounded-2xl border border-white/[0.09] bg-[#09080f]",
            "shadow-[0_32px_100px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
            "data-[state=open]:duration-200 data-[state=closed]:duration-150",
          )}
        >
          <div className="relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-b from-violet-950/60 via-[#0d0916] to-transparent px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                background:
                  "radial-gradient(ellipse 65% 50% at 50% -5%, rgba(139,92,246,0.45) 0%, transparent 65%)",
              }}
              aria-hidden
            />
            <div className="relative mx-auto max-w-3xl text-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
                  Trial
                </span>
                <span className="text-[11px] tabular-nums text-white/35">
                  {formatDisplayCredits(currentCredits)} credits · need{" "}
                  {formatDisplayCredits(requiredCredits)}
                </span>
              </div>

              <Dialog.Title className="mt-4 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl md:text-[1.65rem]">
                You don&rsquo;t have enough credits for your UGC generation
              </Dialog.Title>

              <Dialog.Description className="mt-3 text-sm leading-relaxed text-white/48">
                Your realistic UGC ad is built and ready to render — you&rsquo;re{" "}
                {shortfall > 0 ? (
                  <>
                    <span className="tabular-nums text-amber-200/90">{formatDisplayCredits(shortfall)}</span>{" "}
                    credits short for this step.
                  </>
                ) : (
                  <>just below the credits needed for this step.</>
                )}{" "}
                Pick a plan below (same as on the subscription page).
              </Dialog.Description>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div
              className={cn(
                "mx-auto grid max-w-6xl items-stretch gap-4 sm:gap-5",
                "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
              )}
            >
              {PLAN_ROWS.map((plan, i) => {
                const tier = SUBSCRIPTIONS[i];
                if (!tier) return null;

                const sp = displayPrices?.subscriptions[plan.id];
                const monthly = sp?.monthly;
                const mainLabel = monthly
                  ? monthly.formatted
                  : formatMoneyAmount(tier.price_usd, currency);

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative flex min-h-[26rem] flex-col rounded-2xl border p-4 sm:p-5",
                      plan.highlight
                        ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.16] via-[#0b0914] to-[#06070d] shadow-[0_0_40px_rgba(139,92,246,0.12)] xl:scale-[1.01]"
                        : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    <div className="mb-2 flex min-h-[1.75rem] flex-wrap items-start gap-1.5">
                      {plan.badge ? (
                        <span className="rounded-full border border-violet-400/45 bg-violet-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100">
                          {plan.badge}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-lg font-bold leading-tight text-white sm:text-xl">{plan.name}</h2>
                    <p className="mt-1 min-h-0 text-xs leading-snug text-white/48 sm:text-sm">{plan.description}</p>

                    <div className="mt-2 min-h-[3.5rem]">
                      {billingPricesReady ? (
                        <>
                          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                            <span className="text-3xl font-extrabold tabular-nums leading-none text-white sm:text-4xl">
                              {mainLabel}
                            </span>
                            <span className="text-sm font-semibold leading-none text-white/55">/mo</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-tight text-white/38">Billed every month</p>
                        </>
                      ) : (
                        <div className="space-y-1" aria-hidden>
                          <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
                          <div className="h-3 w-28 animate-pulse rounded bg-white/8" />
                        </div>
                      )}
                    </div>

                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        className={cn(
                          "mt-3 h-10 w-full shrink-0 rounded-xl text-sm font-bold transition-all",
                          plan.highlight
                            ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_4px_0_0_rgba(76,29,149,0.85)] hover:bg-violet-300"
                            : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                        )}
                        asChild
                      >
                        <Link href="/subscription" className="inline-flex items-center justify-center gap-2">
                          Subscribe
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </Button>
                    </Dialog.Close>

                    <SubscriptionPlanFeatureList
                      planId={plan.id}
                      credits={tier.credits_per_month}
                      className="mt-3 min-h-0 flex-1 border-t border-white/10 pt-3 text-[11px] sm:text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
