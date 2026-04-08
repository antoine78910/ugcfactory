"use client";

import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SubscriptionUpgradePreview = {
  current: { planId: string; name: string; billingLabel: string; priceUsd: number };
  target: {
    planId: string;
    name: string;
    billingLabel: string;
    priceUsd: number;
    creditsPerMonth: number;
  };
  subscriptionCreditsRemaining: number;
  prorationCreditUsd: number;
  prorationCreditCents: number;
  amountDueCents: number;
  currency: string;
  renewalSummary: string;
};

function formatMoneyCents(cents: number, currency: string): string {
  const v = Math.abs(cents) / 100;
  const code = currency?.toLowerCase() === "eur" ? "EUR" : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(v);
}

function formatMoneyMajor(amount: number, currency: string): string {
  const code = currency?.toLowerCase() === "eur" ? "EUR" : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: SubscriptionUpgradePreview | null;
  loadingPreview: boolean;
  confirming: boolean;
  onConfirm: () => void | Promise<void>;
};

export function SubscriptionUpgradeDialog({
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
            "fixed left-1/2 top-1/2 z-[241] flex max-h-[min(90vh,640px)] w-[min(94vw,440px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-b from-[#16131f] via-[#0c0a12] to-[#08070d] shadow-[0_24px_100px_rgba(0,0,0,0.75),0_0_0_1px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-200",
          )}
        >
          <div className="border-b border-white/[0.06] px-5 pb-4 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400/90">Upgrading plan</p>
            <Dialog.Title className="mt-1.5 text-lg font-bold tracking-tight text-white sm:text-xl">
              Upgrade your plan
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-white/55">
              Your unused subscription credits are applied as a discount on the first payment.
              You&apos;ll be redirected to Stripe to complete the payment.
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400/90" aria-hidden />
                <span className="text-sm">Calculating…</span>
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Current plan</p>
                    <p className="mt-1.5 text-sm font-semibold text-white/95">
                      {preview.current.name} <span className="text-white/35">·</span>{" "}
                      <span className="font-medium text-white/65">{preview.current.billingLabel.toLowerCase()}</span>
                    </p>
                    <p className="mt-2 text-xl font-bold tabular-nums text-white">
                      {formatMoneyMajor(preview.current.priceUsd, preview.currency)}
                      <span className="text-sm font-medium text-white/40">/mo</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.08] px-3 py-3 shadow-[inset_0_1px_0_rgba(139,92,246,0.15)]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/75">New plan</p>
                    <p className="mt-1.5 text-sm font-semibold text-white">
                      {preview.target.name} <span className="text-white/35">·</span>{" "}
                      <span className="font-medium text-violet-100/85">{preview.target.billingLabel.toLowerCase()}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-violet-200/65">
                      {preview.target.creditsPerMonth.toLocaleString()} credits/mo
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-white">
                      {formatMoneyMajor(preview.target.priceUsd, preview.currency)}
                      <span className="text-sm font-medium text-white/40">/mo</span>
                    </p>
                  </div>
                </div>

                {preview.subscriptionCreditsRemaining > 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Proration credit</p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-white/65">
                        {preview.subscriptionCreditsRemaining} unused credits ×{" "}
                        {formatMoneyMajor(0.07, preview.currency)}
                      </span>
                      <span className="font-semibold tabular-nums text-emerald-300/95">
                        −{formatMoneyCents(preview.prorationCreditCents, preview.currency)}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-3">
                  <span className="text-sm font-semibold text-white/90">Amount due today</span>
                  <span className="text-xl font-bold tabular-nums text-white">
                    {formatMoneyCents(preview.amountDueCents, preview.currency)}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-white/38">
                  By clicking Proceed to checkout, you agree to our{" "}
                  <Link href="https://stripe.com/legal" className="text-violet-300/90 underline-offset-2 hover:underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="https://stripe.com/privacy" className="text-violet-300/90 underline-offset-2 hover:underline">
                    Privacy
                  </Link>
                  . Your current subscription will be cancelled and replaced by the new plan once payment is confirmed.{" "}
                  {preview.renewalSummary}
                </p>
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
              className="h-12 w-full rounded-xl border border-violet-300/35 bg-violet-500 text-base font-semibold text-white shadow-[0_4px_24px_rgba(139,92,246,0.35)] transition hover:bg-violet-400 disabled:opacity-45"
            >
              {confirming ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Redirecting…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-5 w-5 opacity-90" aria-hidden />
                  Proceed to checkout
                </span>
              )}
            </Button>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={confirming}
                className="h-10 w-full text-white/50 hover:bg-white/[0.05] hover:text-white/80"
              >
                Cancel
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
