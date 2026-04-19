"use client";

import Link from "next/link";
import { ArrowRight, Check, Sparkles, Video, Images, Layers, Zap, Infinity, PenLine } from "lucide-react";
import { Dialog } from "radix-ui";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { formatDisplayCredits } from "@/lib/creditLedgerTicks";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import { useBillingDisplayPrices } from "@/lib/billing/useBillingDisplayPrices";
import { cn } from "@/lib/utils";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";

const PLAN_META: {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  highlight?: boolean;
}[] = [
  { id: "starter", name: "Starter" },
  { id: "growth", name: "Growth", badge: "Most popular", highlight: true },
  { id: "pro", name: "Pro" },
  { id: "scale", name: "Scale" },
];

const VALUE_BULLETS: { icon: React.ReactNode; text: string; sub?: string }[] = [
  {
    icon: <Video className="h-4 w-4" />,
    text: "Render your UGC video — right now",
    sub: "Your ad is built. One plan away from downloading it.",
  },
  {
    icon: <PenLine className="h-4 w-4" />,
    text: "Read & fine-tune every prompt",
    sub: "Motion, Dialogue, Ambience, Avatar, Scene — full access to edit every word.",
  },
  {
    icon: <Layers className="h-4 w-4" />,
    text: "Generate ads for all 3 winning angles",
    sub: "Right now you only ran angle 1. Your other angles are waiting.",
  },
  {
    icon: <Images className="h-4 w-4" />,
    text: "Unlimited reference images",
    sub: "Test every look, pick the best start frame, regenerate at will.",
  },
  {
    icon: <Infinity className="h-4 w-4" />,
    text: "Unlimited projects & products",
    sub: "Run a full catalog. No cap on stores, angles or ad variations.",
  },
  {
    icon: <Zap className="h-4 w-4" />,
    text: "Priority rendering queue",
    sub: "Skip the wait. Your videos process ahead of free users.",
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits: number;
  requiredCredits: number;
};

/**
 * Trial Link to Ad: insufficient credits gate on final video render.
 * Shows the full value prop + all 4 subscription tiers in a wide modal.
 * Prices are fetched/cached by IP via useBillingDisplayPrices (24 h TTL).
 */
export function LtaTrialVideoUpgradeDialog({
  open,
  onOpenChange,
  currentCredits,
  requiredCredits,
}: Props) {
  const displayPrices = useBillingDisplayPrices();
  const currency = displayPrices?.currency ?? "usd";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[221] -translate-x-1/2 -translate-y-1/2 outline-none",
            "w-[min(96vw,860px)] max-h-[min(90vh,840px)] overflow-y-auto",
            "rounded-2xl border border-white/[0.09] bg-[#09080f]",
            "shadow-[0_32px_100px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
            "data-[state=open]:duration-200 data-[state=closed]:duration-150",
          )}
        >
          {/* ── Hero ── */}
          <div className="relative overflow-hidden rounded-t-2xl border-b border-white/[0.07] bg-gradient-to-b from-violet-950/70 via-[#0d0916] to-transparent px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                background:
                  "radial-gradient(ellipse 70% 55% at 55% -10%, rgba(139,92,246,0.45) 0%, transparent 70%)",
              }}
              aria-hidden
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
                  Trial plan
                </span>
                <span className="text-[11px] text-white/35">
                  {formatDisplayCredits(currentCredits)}/{formatDisplayCredits(requiredCredits)} credits
                </span>
              </div>

              <Dialog.Title className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Your Realistic UGC Ad is ready.
                <br />
                <span className="text-violet-300">You&rsquo;re one render away.</span>
              </Dialog.Title>

              <Dialog.Description className="sr-only">
                Your trial plan has run out of credits for the final video render. Subscribe to unlock full access.
              </Dialog.Description>

              <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-white/52">
                The trial covers the full workflow — scan, scripts, 3 reference images, and all prompts. A
                subscription unlocks the render and everything else below.
              </p>
            </div>
          </div>

          <div className="grid gap-0 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_minmax(0,440px)]">
            {/* ── Value bullets ── */}
            <div className="border-b border-white/[0.07] px-6 py-5 sm:border-b-0 sm:border-r sm:px-8 sm:py-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/70">
                What you unlock
              </p>
              <ul className="space-y-4">
                {VALUE_BULLETS.map((b) => (
                  <li key={b.text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/[0.14] text-violet-300">
                      {b.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-snug text-white/92">{b.text}</p>
                      {b.sub ? <p className="mt-0.5 text-[11px] leading-snug text-white/40">{b.sub}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Plan cards ── */}
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Choose your plan
              </p>
              <div className="space-y-2.5">
                {PLAN_META.map((meta, i) => {
                  const tier = SUBSCRIPTIONS[i];
                  if (!tier) return null;

                  const sp = displayPrices?.subscriptions[meta.id];
                  const monthly = sp?.monthly;
                  const yearly = sp?.yearly;
                  const priceLabel = monthly
                    ? monthly.formatted
                    : formatMoneyAmount(tier.price_usd, currency);
                  const yearlyLabel = yearly
                    ? yearly.perMonthFormatted
                    : formatMoneyAmount(tier.price_usd * 0.7, currency);

                  return (
                    <Dialog.Close asChild key={meta.id}>
                      <Link
                        href="/subscription"
                        className={cn(
                          "group relative flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-all duration-150",
                          meta.highlight
                            ? "border-violet-400/40 bg-violet-500/[0.11] shadow-[0_0_0_1px_rgba(139,92,246,0.12)] hover:border-violet-400/55 hover:bg-violet-500/[0.17]"
                            : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.13] hover:bg-white/[0.045]",
                        )}
                      >
                        {meta.highlight ? (
                          <span className="absolute -top-2.5 left-3 rounded-full border border-violet-400/35 bg-[#09080f] px-2.5 py-px text-[10px] font-bold uppercase tracking-wide text-violet-300/90">
                            {meta.badge}
                          </span>
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[13px] font-semibold",
                                meta.highlight ? "text-white" : "text-white/85",
                              )}
                            >
                              {meta.name}
                            </span>
                            <span className="text-[11px] tabular-nums text-white/35">
                              · {formatDisplayCredits(tier.credits_per_month)} cr/mo
                            </span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                            <span
                              className={cn(
                                "text-base font-bold tabular-nums",
                                meta.highlight ? "text-violet-100" : "text-white/80",
                              )}
                            >
                              {priceLabel}
                              <span className="ml-0.5 text-[11px] font-normal text-white/35">/mo</span>
                            </span>
                            {yearly ? (
                              <span className="text-[10px] tabular-nums text-violet-300/60">
                                {yearlyLabel}/mo yearly (−30%)
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {meta.highlight ? (
                            <Sparkles className="h-3.5 w-3.5 text-violet-300/70" aria-hidden />
                          ) : null}
                          <ArrowRight
                            className={cn(
                              "h-4 w-4 transition-transform group-hover:translate-x-0.5",
                              meta.highlight ? "text-violet-300/60" : "text-white/25",
                            )}
                            aria-hidden
                          />
                        </div>
                      </Link>
                    </Dialog.Close>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3">
                <p className="text-[11px] font-medium text-white/35">
                  All plans include everything you built during your trial, full prompt editing, and a{" "}
                  <span className="text-white/55">14-day money-back guarantee</span>.
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <Dialog.Close asChild>
                  <Link
                    href="/credits"
                    className="block text-center text-[11px] text-white/35 transition hover:text-violet-300/80"
                  >
                    Prefer one-time credits? →
                  </Link>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="w-full py-1.5 text-center text-[11px] text-white/25 transition hover:text-white/50"
                  >
                    Close
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
