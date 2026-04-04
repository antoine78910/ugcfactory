"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Coins, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import { consumeCheckoutQueryParams, useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SUBSCRIPTIONS,
  upToAiImagesCountFromCredits,
  upToAiVideosCountFromCredits,
} from "@/lib/pricing";
import {
  planRank,
  SUBSCRIPTION_MODEL_MATRIX_ROWS,
  SUBSCRIPTION_STUDIO_ACCESS_ROWS,
  type AccountPlanId,
} from "@/lib/subscriptionModelAccess";
import {
  subscriptionPlanSortIndex,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";

type Billing = "monthly" | "yearly";
const BILLING_PORTAL_URL =
  process.env.NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL ??
  "https://billing.stripe.com/p/login/14A00icKheIV9ws8ZNfUQ00";

type PlanDef = {
  id: string;
  name: string;
  badge?: string;
  description: string;
  monthly: number;
  credits: number;
  /** Approx. monthly capacity at typical credit costs (Link to Ad / images / videos). */
  usage: { linkToAd: string; images: string; videos: string };
  highlight?: boolean;
};

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    description: "First campaigns and core workflow.",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
    usage: {
      linkToAd: "4",
      images: String(upToAiImagesCountFromCredits(SUBSCRIPTIONS[0].credits_per_month)),
      videos: String(upToAiVideosCountFromCredits(SUBSCRIPTIONS[0].credits_per_month)),
    },
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Popular",
    description: "Weekly content — most teams start here.",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: {
      linkToAd: "10",
      images: String(upToAiImagesCountFromCredits(SUBSCRIPTIONS[1].credits_per_month)),
      videos: String(upToAiVideosCountFromCredits(SUBSCRIPTIONS[1].credits_per_month)),
    },
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Higher volume without constant limits.",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: {
      linkToAd: "24",
      images: String(upToAiImagesCountFromCredits(SUBSCRIPTIONS[2].credits_per_month)),
      videos: String(upToAiVideosCountFromCredits(SUBSCRIPTIONS[2].credits_per_month)),
    },
  },
  {
    id: "scale",
    name: "Scale",
    description: "Agencies & brands with many products.",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: {
      linkToAd: "55",
      images: String(upToAiImagesCountFromCredits(SUBSCRIPTIONS[3].credits_per_month)),
      videos: String(upToAiVideosCountFromCredits(SUBSCRIPTIONS[3].credits_per_month)),
    },
  },
];

export default function SubscriptionPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  /** Stripe subscription billing from DB; null = free, unknown, or not loaded yet. */
  const [serverSubBilling, setServerSubBilling] = useState<"monthly" | "yearly" | null | "pending">(
    "pending",
  );
  const { planId, planDisplayName } = useCreditsPlan();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/subscription", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setServerSubBilling(null);
          return;
        }
        const data = (await res.json()) as { billing?: unknown };
        const raw = data.billing;
        const b =
          raw === "yearly" ? "yearly" : raw === "monthly" ? "monthly" : null;
        if (!cancelled) setServerSubBilling(b);
      } catch {
        if (!cancelled) setServerSubBilling(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("checkout");
    if (c === "cancel") {
      toast.message("Checkout cancelled");
      window.history.replaceState({}, "", "/subscription");
      return;
    }
    if (c === "success") {
      const applied = consumeCheckoutQueryParams(window.location.pathname);
      toast.success(
        applied ? "Subscription updated" : "Checkout completed",
        applied
          ? { description: "Your plan and credits in the sidebar are up to date." }
          : { description: "Stripe will confirm your subscription shortly." },
      );
      if (!applied) window.history.replaceState({}, "", "/subscription");
    }
  }, []);

  async function startSubscriptionCheckout(planIdCheckout: string) {
    setCheckoutLoading(planIdCheckout);
    const plan = PLANS.find((p) => p.id === planIdCheckout);
    window.datafast?.("initiate_checkout", {
      type: "subscription",
      plan: planIdCheckout,
      billing,
      price: String(plan?.monthly ?? ""),
    });
    try {
      const res = await fetch("/api/stripe/checkout/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: planIdCheckout,
          billing,
          referral: window.linkjolt?.referral ?? "",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  }

  function priceFor(plan: PlanDef) {
    if (billing === "monthly") {
      return { mainLabel: String(plan.monthly), sub: "Billed every month" };
    }
    const perMonthEquiv = plan.monthly * 0.7;
    const yearlyTotal = plan.monthly * 8.4;
    const mainLabel = Number.isInteger(perMonthEquiv) ? String(perMonthEquiv) : perMonthEquiv.toFixed(2);
    return {
      mainLabel,
      sub: `Billed yearly ($${yearlyTotal.toLocaleString("en-US")}/yr).`,
    };
  }

  function isModelIncluded(planIdRaw: string, row: (typeof SUBSCRIPTION_MODEL_MATRIX_ROWS)[number]): boolean {
    const planId = (planIdRaw === "free" ? "free" : planIdRaw) as AccountPlanId;
    const r = planRank(planId);
    const idx = Math.max(0, Math.min(3, r - 1));
    return row.tiers[idx];
  }

  const isSubscribed = planId !== "free";

  const planGridClass =
    "grid-cols-1 items-stretch sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch";

  return (
    <StudioShell>
      <div className="relative min-w-0 overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[960px] -translate-x-1/2 rounded-full bg-violet-600/14 blur-[130px]" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-indigo-600/10 blur-[90px]" />

        <div className="relative mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6 md:py-8">
          <header className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">Subscription</p>
            <h1 className="mt-2 bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl md:text-[2.75rem] md:leading-[1.08]">
              Grow with a plan that keeps up
            </h1>
            <p className="mt-3 text-xs text-white/38">
              Need a one-time boost instead?{" "}
              <Link
                href="/credits"
                className="font-medium text-violet-300/95 underline-offset-4 transition hover:text-violet-200 hover:underline"
              >
                Credit packs
              </Link>
            </p>

            <div className="mt-6 flex justify-center">
              <div
                className="inline-flex rounded-full border border-white/10 bg-black/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                role="group"
                aria-label="Billing period"
              >
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={cn(
                    "rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200",
                    billing === "monthly"
                      ? "bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
                      : "text-white/45 hover:text-white/75",
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("yearly")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200",
                    billing === "yearly"
                      ? "bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
                      : "text-white/45 hover:text-white/75",
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    Yearly
                    <span className="rounded-full border border-emerald-300/45 bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.28)]">
                      Save 30%
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </header>

          <section>
            <div className={cn("mx-auto grid max-w-6xl gap-3 sm:gap-4", planGridClass)}>
              {PLANS.map((plan) => {
                const { mainLabel, sub } = priceFor(plan);
                const planIdx = subscriptionPlanSortIndex(plan.id as SubscriptionPlanId);
                const currentIdx = isSubscribed
                  ? subscriptionPlanSortIndex(planId as SubscriptionPlanId)
                  : -1;
                const isSameTier = isSubscribed && plan.id === planId;
                const isLowerTier =
                  isSubscribed && planIdx >= 0 && currentIdx >= 0 && planIdx < currentIdx;

                const serverBillResolved =
                  serverSubBilling === "monthly" || serverSubBilling === "yearly"
                    ? serverSubBilling
                    : null;
                const exactPlanAndBilling =
                  isSameTier &&
                  ((serverBillResolved === "monthly" && billing === "monthly") ||
                    (serverBillResolved === "yearly" && billing === "yearly") ||
                    (serverBillResolved === null &&
                      serverSubBilling !== "pending" &&
                      billing === "monthly"));

                const isCurrentPlanCard = isSameTier;
                const showYearlySavingsBadge =
                  billing === "yearly" &&
                  !(isSameTier && serverBillResolved === "yearly");

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative flex h-full flex-col rounded-2xl border p-4 transition-all duration-300 sm:p-5",
                      isCurrentPlanCard
                        ? "border-emerald-400/45 bg-gradient-to-b from-emerald-600/[0.14] via-[#0b0914] to-[#06070d] shadow-[0_0_40px_rgba(16,185,129,0.12)]"
                        : plan.highlight
                          ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.18] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14),0_8px_0_0_rgba(76,29,149,0.4)]"
                          : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    {/* Fixed row height so badges line up across plans */}
                    <div className="mb-2 flex min-h-[1.5rem] flex-wrap content-start items-center gap-1.5">
                      {isCurrentPlanCard ? (
                        <span className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                          Current plan
                        </span>
                      ) : null}
                      {!isCurrentPlanCard && plan.badge ? (
                        <span className="rounded-full border border-violet-400/45 bg-violet-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100">
                          {plan.badge}
                        </span>
                      ) : null}
                      {showYearlySavingsBadge ? (
                        <span className="rounded-full border border-emerald-300/45 bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                          Save 30%
                        </span>
                      ) : null}
                    </div>

                    <div className="shrink-0">
                      <h2 className="text-lg font-bold leading-tight text-white sm:text-xl">{plan.name}</h2>
                      <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-[13px] leading-snug text-white/48 sm:text-sm">
                        {plan.description}
                      </p>
                    </div>

                    {/* Same vertical space for price + billing note + yearly pill slot */}
                    <div className="mt-3 flex min-h-[5.5rem] shrink-0 flex-col">
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-3xl font-extrabold tabular-nums leading-none text-white md:text-4xl">
                          ${mainLabel}
                        </span>
                        <span className="text-sm font-semibold text-white/55">/mo</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 min-h-[1.75rem] text-[11px] leading-snug text-white/38">{sub}</p>
                      <div className="mt-1.5 min-h-[1.35rem]">
                        {billing === "yearly" ? (
                          <p className="inline-flex items-center rounded-md border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                            Save 30% on yearly billing
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      type="button"
                      disabled={
                        Boolean(checkoutLoading) ||
                        exactPlanAndBilling ||
                        isLowerTier ||
                        (isSameTier && serverSubBilling === "pending")
                      }
                      onClick={() => void startSubscriptionCheckout(plan.id)}
                      className={cn(
                        "mt-3 h-10 w-full rounded-xl text-sm font-bold transition-all sm:h-11",
                        exactPlanAndBilling || isLowerTier
                          ? "cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/40 shadow-none hover:bg-white/[0.06]"
                          : plan.highlight
                            ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
                            : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === plan.id ? (
                        "Redirecting…"
                      ) : isSameTier && serverSubBilling === "pending" ? (
                        "Loading…"
                      ) : exactPlanAndBilling ? (
                        "Current plan"
                      ) : isLowerTier ? (
                        "Below current plan"
                      ) : isSameTier && billing === "yearly" && serverSubBilling !== "yearly" ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          Switch to yearly
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      ) : isSameTier && billing === "monthly" && serverSubBilling === "yearly" ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          Switch to monthly
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-2">
                          {isSubscribed ? "Upgrade" : "Subscribe"}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </Button>

                    <ul className="mt-3 flex flex-1 flex-col space-y-1.5 border-t border-white/10 pt-3 text-left text-[11px] text-white/72 sm:text-xs">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-200 sm:h-5 sm:w-5">
                          <Coins className="h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="font-semibold tabular-nums text-white">
                            {plan.credits.toLocaleString()} credits
                          </span>
                        </span>
                      </li>
                      <li className="pl-1 text-white/50">
                        Up to {Number(plan.usage.images).toLocaleString()} AI images (NanoBanana 2)
                      </li>
                      <li className="pl-1 text-white/50">
                        Up to {Number(plan.usage.videos).toLocaleString()} AI videos (Sora 2)
                      </li>
                      <li className="pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                        Studio & tools
                      </li>
                      <li className="pl-1 text-white/55">
                        <div className="space-y-1">
                          {SUBSCRIPTION_STUDIO_ACCESS_ROWS.map((row) => {
                            const included = isModelIncluded(plan.id, row);
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
                                    {included ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
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
                      <li className="pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                        Included models
                      </li>
                      <li className="pl-1 text-white/55">
                        <div className="space-y-1">
                          {SUBSCRIPTION_MODEL_MATRIX_ROWS.map((row) => {
                            const included = isModelIncluded(plan.id, row);
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
                                    {included ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
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
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mx-auto max-w-4xl">
            <h2 className="text-center text-xs font-bold uppercase tracking-[0.16em] text-white/40">Your account</h2>
            <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 sm:h-14 sm:w-14 sm:rounded-2xl">
                    <CreditCard className="h-6 w-6 text-violet-200/90" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          isSubscribed
                            ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                            : "border-white/15 bg-white/[0.06] text-white/55",
                        )}
                      >
                        {isSubscribed ? "Subscribed" : "Free"}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-xl font-bold text-white sm:text-2xl">{planDisplayName}</h3>

                    {isSubscribed ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
                          onClick={() =>
                            window.open(BILLING_PORTAL_URL, "_blank", "noopener,noreferrer")
                          }
                        >
                          Manage billing
                        </Button>
                      </div>
                    ) : null}

                    <p className="mt-1.5 max-w-md text-sm leading-snug text-white/48">
                      {isSubscribed
                        ? "Your monthly credits refresh with your plan. Use them across Link to Ad, Image, and Video in the studio."
                        : "You’re on the free tier. Add a subscription for monthly credits or buy packs on the Credits page."}
                    </p>

                    {isSubscribed ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <p className="text-center text-[11px] text-white/28">
                          Checkout is powered by Stripe. Subscription credits reset each billing cycle and do not carry over.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

            </div>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
