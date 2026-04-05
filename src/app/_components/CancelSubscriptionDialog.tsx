"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Gift,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "warning" | "offer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  /** e.g. "March 25, 2026" — shown as "Your subscription is active until …" */
  subscriptionActiveUntilLabel: string | null;
  /** When false, the -30% step is skipped (already used once per Stripe customer). */
  retentionOfferEligible: boolean;
  retentionEligibilityLoading: boolean;
  onAcceptDiscount: () => void | Promise<void>;
  onConfirmCancel: () => void | Promise<void>;
  applyingDiscount: boolean;
  cancelling: boolean;
};

const LOST_ITEMS = [
  "Projects and generated media — we prioritize storage for active paying subscribers, so when your plan ends your projects and files may be removed to free capacity.",
  "Your saved projects and brand briefs",
  "Your AI voice clones and avatar settings",
  "Access to all premium AI models",
  "Your credit balance (credits do not carry over)",
];

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  planName,
  subscriptionActiveUntilLabel,
  retentionOfferEligible,
  retentionEligibilityLoading,
  onAcceptDiscount,
  onConfirmCancel,
  applyingDiscount,
  cancelling,
}: Props) {
  const [step, setStep] = useState<Step>("warning");

  function handleOpenChange(o: boolean) {
    if (!o) setStep("warning");
    onOpenChange(o);
  }

  const busy = applyingDiscount || cancelling;
  const checkingEligibility = retentionEligibilityLoading;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/80 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[241] flex max-h-[min(90vh,720px)] w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-200",
            step === "warning"
              ? "border-red-500/25 bg-gradient-to-b from-[#1a0f0f] via-[#0c0a12] to-[#08070d] shadow-[0_24px_100px_rgba(0,0,0,0.75),0_0_0_1px_rgba(220,38,38,0.15),inset_0_1px_0_rgba(255,255,255,0.04)]"
              : "border-violet-500/25 bg-gradient-to-b from-[#16131f] via-[#0c0a12] to-[#08070d] shadow-[0_24px_100px_rgba(0,0,0,0.75),0_0_0_1px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]",
          )}
        >
          {step === "warning" ? (
            <>
              <div className="border-b border-white/[0.06] px-5 pb-4 pt-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/15">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <Dialog.Title className="text-lg font-bold tracking-tight text-white sm:text-xl">
                      Cancel your subscription?
                    </Dialog.Title>
                  </div>
                </div>
                <Dialog.Description asChild>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/55">
                    <p>
                      Cancelling a subscription will result in immediate loss of access to premium features at the end
                      of your current billing period. This action cannot be undone and may result in data loss.
                    </p>
                    <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-white/80">
                      <p className="text-[13px]">
                        <span className="font-semibold text-white/95">Current plan:</span> {planName}
                      </p>
                      {subscriptionActiveUntilLabel ? (
                        <p className="mt-1.5 text-[13px] text-white/65">
                          Your subscription is active until{" "}
                          <span className="font-semibold text-violet-200/95">{subscriptionActiveUntilLabel}</span>
                        </p>
                      ) : null}
                    </div>
                    <p>
                      If you cancel your <span className="font-semibold text-white/80">{planName}</span> plan, you will
                      permanently lose access to the following at the end of your billing period:
                    </p>
                  </div>
                </Dialog.Description>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="space-y-2">
                  {LOST_ITEMS.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-3 py-2.5"
                    >
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400/80" aria-hidden />
                      <span className="text-[13px] leading-snug text-white/75">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-red-400/15 bg-red-500/[0.06] px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-300/70" aria-hidden />
                    <p className="text-[13px] font-medium leading-relaxed text-red-200/80">
                      This action is irreversible. Your data cannot be recovered once your subscription ends.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-white/[0.06] px-5 py-4">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    className="h-12 w-full rounded-xl border border-violet-400/40 bg-violet-500 text-base font-semibold text-white shadow-[0_4px_24px_rgba(139,92,246,0.35)] transition hover:bg-violet-400"
                  >
                    Keep my plan
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={checkingEligibility}
                  onClick={() => {
                    if (checkingEligibility) return;
                    if (!retentionOfferEligible) {
                      void onConfirmCancel();
                      return;
                    }
                    setStep("offer");
                  }}
                  className="h-10 w-full text-red-300/60 hover:bg-red-500/[0.08] hover:text-red-200/80 disabled:opacity-50"
                >
                  {checkingEligibility ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Checking…
                    </span>
                  ) : (
                    "I still want to cancel"
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-white/[0.06] px-5 pb-4 pt-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/35 bg-violet-500/15">
                    <Gift className="h-5 w-5 text-violet-300" />
                  </div>
                  <div>
                    <Dialog.Title className="text-lg font-bold tracking-tight text-white sm:text-xl">
                      Wait — we have an offer for you
                    </Dialog.Title>
                  </div>
                </div>
                <Dialog.Description className="mt-3 text-sm leading-relaxed text-white/55">
                  We&apos;d hate to see you go. How about{" "}
                  <span className="font-bold text-violet-300">30% off</span> your next month?
                  Keep all your projects, credits and AI models at a reduced price.
                </Dialog.Description>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.12] to-transparent px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(139,92,246,0.15)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/90">
                    Exclusive retention offer
                  </p>
                  <p className="mt-3 text-4xl font-extrabold tabular-nums text-white">
                    30<span className="text-2xl font-bold text-violet-300">% off</span>
                  </p>
                  <p className="mt-1.5 text-sm text-white/50">
                    on your next billing cycle
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-white/38">
                    The discount is applied automatically. You keep your {planName} plan,
                    all your data and your remaining credits.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-white/[0.06] px-5 py-4">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAcceptDiscount()}
                  className="h-12 w-full rounded-xl border border-violet-400/35 bg-violet-500 text-base font-semibold text-white shadow-[0_4px_24px_rgba(139,92,246,0.35)] transition hover:bg-violet-400 disabled:opacity-45"
                >
                  {applyingDiscount ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      Applying discount…
                    </span>
                  ) : (
                    "Claim 30% off — keep my plan"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onConfirmCancel()}
                  className="h-10 w-full text-red-300/50 hover:bg-red-500/[0.08] hover:text-red-200/70"
                >
                  {cancelling ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Opening billing…
                    </span>
                  ) : (
                    "No thanks, cancel anyway"
                  )}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
