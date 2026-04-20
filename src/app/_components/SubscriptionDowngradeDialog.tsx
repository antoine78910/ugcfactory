"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SubscriptionPlanCreditsWithBonus } from "@/app/_components/SubscriptionPlanFeatureList";
import { isSubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";

function formatMoneyMajor(amount: number, currency: string): string {
  return formatMoneyAmount(amount, currency?.toLowerCase() === "eur" ? "eur" : "usd");
}

export type SubscriptionDowngradePreview = {
  currency?: string;
  current: {
    planId: string;
    name: string;
    billingLabel: string;
    priceUsd: number;
    creditsPerMonth: number;
  };
  target: {
    planId: string;
    name: string;
    billingLabel: string;
    priceUsd: number;
    creditsPerMonth: number;
  };
  effectiveAt: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: SubscriptionDowngradePreview | null;
  loadingPreview: boolean;
  confirming: boolean;
  onConfirm: () => void | Promise<void>;
};

export function SubscriptionDowngradeDialog({
  open,
  onOpenChange,
  preview,
  loadingPreview,
  confirming,
  onConfirm,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/75 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[241] flex max-h-[min(90vh,560px)] w-[min(94vw,440px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-b from-[#1a1510] via-[#0c0a12] to-[#08070d] shadow-[0_24px_100px_rgba(0,0,0,0.75),0_0_0_1px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-200",
          )}
        >
          <div className="border-b border-white/[0.06] px-5 pb-4 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/90">
              Downgrading plan
            </p>
            <Dialog.Title className="mt-1.5 text-lg font-bold tracking-tight text-white sm:text-xl">
              Switch to a smaller plan
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-white/55">
              Your current plan stays active until the end of your billing period.
              The new plan takes effect at the next renewal.
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400/90" aria-hidden />
                <span className="text-sm">Loading…</span>
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      Current plan
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-white/95">
                      {preview.current.name}
                    </p>
                    <div className="mt-1 min-w-0">
                      {isSubscriptionPlanId(preview.current.planId) ? (
                        <SubscriptionPlanCreditsWithBonus
                          planId={preview.current.planId}
                          credits={preview.current.creditsPerMonth}
                          billingCurrency={preview.currency}
                          compact
                          showCoins={false}
                        />
                      ) : (
                        <p className="text-[11px] text-white/50">
                          {preview.current.creditsPerMonth.toLocaleString()} credits/mo
                        </p>
                      )}
                    </div>
                    <p className="mt-1 text-xl font-bold tabular-nums text-white">
                      {formatMoneyMajor(preview.current.priceUsd, preview.currency ?? "usd")}
                      <span className="text-sm font-medium text-white/40">/mo</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-3 shadow-[inset_0_1px_0_rgba(245,158,11,0.1)]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/75">
                      New plan
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-white">
                      {preview.target.name}
                    </p>
                    <div className="mt-1 min-w-0">
                      {isSubscriptionPlanId(preview.target.planId) ? (
                        <SubscriptionPlanCreditsWithBonus
                          planId={preview.target.planId}
                          credits={preview.target.creditsPerMonth}
                          billingCurrency={preview.currency}
                          compact
                          showCoins={false}
                        />
                      ) : (
                        <p className="text-[11px] text-amber-200/60">
                          {preview.target.creditsPerMonth.toLocaleString()} credits/mo
                        </p>
                      )}
                    </div>
                    <p className="mt-1 text-xl font-bold tabular-nums text-white">
                      {formatMoneyMajor(preview.target.priceUsd, preview.currency ?? "usd")}
                      <span className="text-sm font-medium text-white/40">/mo</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" aria-hidden />
                    <div className="text-[13px] leading-relaxed text-white/70">
                      <p>
                        You keep <span className="font-semibold text-white/95">{preview.current.name}</span> access
                        and your current credits until{" "}
                        <span className="font-semibold text-white/95">{preview.effectiveAt}</span>.
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
                        Starting then, your plan becomes{" "}
                        <span className="font-semibold text-white/95">{preview.target.name}</span>
                        <span className="text-white/70">with</span>
                        {isSubscriptionPlanId(preview.target.planId) ? (
                          <SubscriptionPlanCreditsWithBonus
                            planId={preview.target.planId}
                            credits={preview.target.creditsPerMonth}
                            billingCurrency={preview.currency}
                            compact
                            showCoins={false}
                          />
                        ) : (
                          <span className="font-semibold text-white/95">
                            {preview.target.creditsPerMonth.toLocaleString()} credits/mo
                          </span>
                        )}
                        <span className="text-white/70">
                          at {formatMoneyMajor(preview.target.priceUsd, preview.currency ?? "usd")}/mo.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-white/45">Could not load preview.</p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/[0.06] px-5 py-4">
            <Button
              type="button"
              disabled={!preview || loadingPreview || confirming}
              onClick={() => void onConfirm()}
              className="h-12 w-full rounded-xl border border-amber-400/35 bg-amber-500/80 text-base font-semibold text-white shadow-[0_4px_24px_rgba(245,158,11,0.25)] transition hover:bg-amber-400/90 disabled:opacity-45"
            >
              {confirming ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Processing…
                </span>
              ) : (
                "Confirm downgrade"
              )}
            </Button>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={confirming}
                className="h-10 w-full text-white/50 hover:bg-white/[0.05] hover:text-white/80"
              >
                Keep current plan
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
