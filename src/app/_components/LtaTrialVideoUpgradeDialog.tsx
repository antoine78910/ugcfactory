"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Dialog } from "radix-ui";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { formatDisplayCredits } from "@/lib/creditLedgerTicks";
import { cn } from "@/lib/utils";

const PLAN_ROWS: { id: string; name: string; badge?: string; highlight?: boolean }[] = [
  { id: "starter", name: "Starter" },
  { id: "growth", name: "Growth", badge: "Popular", highlight: true },
  { id: "pro", name: "Pro" },
  { id: "scale", name: "Scale" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits: number;
  requiredCredits: number;
};

/**
 * Trial Link to Ad: when final video render is gated by credits, show every subscription tier
 * in one calm sheet (instead of the generic studio billing popup).
 */
export function LtaTrialVideoUpgradeDialog({ open, onOpenChange, currentCredits, requiredCredits }: Props) {
  const shortfall = Math.max(0, requiredCredits - currentCredits);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/55 backdrop-blur-[6px] transition-opacity duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[221] w-[min(94vw,440px)] max-h-[min(88vh,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/[0.09]",
            "bg-[#0a0910]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-[0.99] data-[state=open]:zoom-in-[0.99] data-[state=open]:duration-200 data-[state=closed]:duration-150",
          )}
        >
          <div className="border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
            <Dialog.Title className="text-[17px] font-semibold tracking-tight text-white">
              Subscribe to generate your video
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-white/50">
              The trial covers the workflow up to here. This render needs{" "}
              <span className="tabular-nums text-violet-200/90">{formatDisplayCredits(requiredCredits)}</span>{" "}
              credits; you have{" "}
              <span className="tabular-nums text-white/75">{formatDisplayCredits(currentCredits)}</span>
              {shortfall > 0 ? (
                <>
                  {" "}
                  (<span className="tabular-nums text-amber-200/90">{formatDisplayCredits(shortfall)}</span> short).
                </>
              ) : null}{" "}
              Choose a plan below — each includes monthly credits for full runs.
            </Dialog.Description>
          </div>

          <div className="space-y-2 px-5 py-4 sm:px-6">
            {SUBSCRIPTIONS.map((tier, i) => {
              const meta = PLAN_ROWS[i];
              if (!meta) return null;
              const label = meta.name;
              return (
                <Dialog.Close asChild key={meta.id}>
                  <Link
                    href="/subscription"
                    className={cn(
                      "group flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors",
                      meta.highlight
                        ? "border-violet-400/35 bg-violet-500/[0.12] hover:border-violet-400/50 hover:bg-violet-500/[0.16]"
                        : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white/95">{label}</span>
                        {meta.badge ? (
                          <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
                            {meta.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs tabular-nums text-white/45">
                        ${tier.price_usd}/mo · {formatDisplayCredits(tier.credits_per_month)} credits / month
                      </p>
                    </div>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-violet-300/80"
                      aria-hidden
                    />
                  </Link>
                </Dialog.Close>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
            <Dialog.Close asChild>
              <Link
                href="/credits"
                className="block text-center text-xs font-medium text-white/40 transition hover:text-violet-200/80"
              >
                Prefer one-time credits? View packs →
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="mt-3 w-full py-2 text-center text-xs text-white/35 transition hover:text-white/55"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
