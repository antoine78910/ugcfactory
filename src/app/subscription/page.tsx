"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Coins, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import type { SubscriptionDowngradePreview } from "@/app/_components/SubscriptionDowngradeDialog";
import type { SubscriptionUpgradePreview } from "@/app/_components/SubscriptionUpgradeDialog";
import { consumeCheckoutQueryParams, useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import {
  planRank,
  SUBSCRIPTION_MODEL_MATRIX_ROWS,
  type AccountPlanId,
} from "@/lib/subscriptionModelAccess";
import {
  subscriptionPlanSortIndex,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import { openStripeBillingPortal } from "@/lib/stripe/openBillingPortalClient";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import {
  upToEstimateAiImagesFromCredits,
  upToEstimateAiVideosFromCredits,
} from "@/lib/billing/creditUsageEstimates";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";

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

function upToAiImagesFromMonthlyCredits(creditsPerMonth: number): string {
  return String(upToEstimateAiImagesFromCredits(creditsPerMonth));
}

function upToAiVideosFromMonthlyCredits(creditsPerMonth: number): string {
  return String(upToEstimateAiVideosFromCredits(creditsPerMonth));
}

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Learn the workflow and launch your first campaigns.",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
    usage: {
      linkToAd: "4",
      images: upToAiImagesFromMonthlyCredits(SUBSCRIPTIONS[0].credits_per_month),
      videos: upToAiVideosFromMonthlyCredits(SUBSCRIPTIONS[0].credits_per_month),
    },
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Popular",
    description: "The plan most teams pick once content is weekly.",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: {
      linkToAd: "10",
      images: upToAiImagesFromMonthlyCredits(SUBSCRIPTIONS[1].credits_per_month),
      videos: upToAiVideosFromMonthlyCredits(SUBSCRIPTIONS[1].credits_per_month),
    },
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Scale creatives without hitting limits every few days.",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: {
      linkToAd: "24",
      images: upToAiImagesFromMonthlyCredits(SUBSCRIPTIONS[2].credits_per_month),
      videos: upToAiVideosFromMonthlyCredits(SUBSCRIPTIONS[2].credits_per_month),
    },
  },
  {
    id: "scale",
    name: "Scale",
    description: "Agencies and brands running multiple products at once.",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: {
      linkToAd: "55",
      images: upToAiImagesFromMonthlyCredits(SUBSCRIPTIONS[3].credits_per_month),
      videos: upToAiVideosFromMonthlyCredits(SUBSCRIPTIONS[3].credits_per_month),
    },
  },
];

function SubscriptionPlanPriceSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      <div className="h-10 w-[min(100%,14rem)] animate-pulse rounded-lg bg-white/12 md:h-11" />
      <div className="h-3 w-48 max-w-full animate-pulse rounded bg-white/10" />
    </div>
  );
}

function PlanCardDescription({ plan }: { plan: PlanDef }) {
  return <p className="mt-1 min-h-0 text-sm leading-snug text-white/48">{plan.description}</p>;
}

/** Minimal violet pill on the Yearly billing toggle only. */
function YearlyToggleSaveBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 inline-flex items-center justify-center whitespace-nowrap rounded-full",
        "border border-violet-300/50 bg-violet-500/35 px-2.5 py-1",
        "text-[11px] font-bold tabular-nums tracking-wide text-white",
        "shadow-[0_0_14px_rgba(139,92,246,0.45)]",
        className,
      )}
    >
      −30%
    </span>
  );
}

export default function SubscriptionPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  /** Stripe subscription billing from DB; null = free, unknown, or not loaded yet. */
  const [serverSubBilling, setServerSubBilling] = useState<"monthly" | "yearly" | null | "pending">(
    "pending",
  );
  const { planId, planDisplayName } = useCreditsPlan();
  const [displayPrices, setDisplayPrices] = useState<StripeDisplayPricesPayload | null>(null);

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<SubscriptionUpgradePreview | null>(null);
  const [upgradePreviewLoading, setUpgradePreviewLoading] = useState(false);
  const [upgradeConfirmLoading, setUpgradeConfirmLoading] = useState(false);
  const [pendingUpgradePlanId, setPendingUpgradePlanId] = useState<string | null>(null);

  const [downgradeDialogOpen, setDowngradeDialogOpen] = useState(false);
  const [downgradePreview, setDowngradePreview] = useState<SubscriptionDowngradePreview | null>(null);
  const [downgradePreviewLoading, setDowngradePreviewLoading] = useState(false);
  const [downgradeConfirmLoading, setDowngradeConfirmLoading] = useState(false);
  const [pendingDowngradePlanId, setPendingDowngradePlanId] = useState<string | null>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelDiscountLoading, setCancelDiscountLoading] = useState(false);
  const [cancelPortalLoading, setCancelPortalLoading] = useState(false);
  const [subscriptionActiveUntilLabel, setSubscriptionActiveUntilLabel] = useState<string | null>(null);
  /** From Stripe: user canceled renewal but still has access until period end. */
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [retentionOfferEligible, setRetentionOfferEligible] = useState(false);
  const [retentionEligibilityLoading, setRetentionEligibilityLoading] = useState(false);

  const openUpgradeDialog = useCallback(
    async (planIdCheckout: string) => {
      setPendingUpgradePlanId(planIdCheckout);
      setUpgradeDialogOpen(true);
      setUpgradePreviewLoading(true);
      setUpgradePreview(null);
      try {
        const res = await fetch("/api/stripe/subscription/upgrade-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: planIdCheckout, billing }),
        });
        const data = (await res.json()) as SubscriptionUpgradePreview & { error?: string };
        if (!res.ok) throw new Error(data.error || "Could not load upgrade preview.");
        setUpgradePreview(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load upgrade preview.");
        setUpgradeDialogOpen(false);
        setPendingUpgradePlanId(null);
      } finally {
        setUpgradePreviewLoading(false);
      }
    },
    [billing],
  );

  const confirmSubscriptionUpgrade = useCallback(async () => {
    if (!pendingUpgradePlanId) return;
    setUpgradeConfirmLoading(true);
    try {
      const res = await fetch("/api/stripe/subscription/upgrade-confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: pendingUpgradePlanId,
          billing,
          referral: window.linkjolt?.referral ?? "",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not start upgrade checkout.");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upgrade failed.");
    } finally {
      setUpgradeConfirmLoading(false);
    }
  }, [billing, pendingUpgradePlanId]);

  const openDowngradeDialog = useCallback(
    async (planIdTarget: string) => {
      setPendingDowngradePlanId(planIdTarget);
      setDowngradeDialogOpen(true);
      setDowngradePreviewLoading(true);
      setDowngradePreview(null);
      try {
        const res = await fetch("/api/stripe/subscription/downgrade-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: planIdTarget, billing }),
        });
        const data = (await res.json()) as SubscriptionDowngradePreview & { error?: string };
        if (!res.ok) throw new Error(data.error || "Could not load downgrade preview.");
        setDowngradePreview(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load downgrade preview.");
        setDowngradeDialogOpen(false);
        setPendingDowngradePlanId(null);
      } finally {
        setDowngradePreviewLoading(false);
      }
    },
    [billing],
  );

  const confirmDowngrade = useCallback(async () => {
    if (!pendingDowngradePlanId) return;
    setDowngradeConfirmLoading(true);
    try {
      const res = await fetch("/api/stripe/subscription/downgrade-confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: pendingDowngradePlanId, billing }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not process downgrade.");
      toast.success("Downgrade scheduled", {
        description: `Your plan will switch to ${downgradePreview?.target.name ?? "the new plan"} at your next renewal.`,
      });
      setDowngradeDialogOpen(false);
      setDowngradePreview(null);
      setPendingDowngradePlanId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Downgrade failed.");
    } finally {
      setDowngradeConfirmLoading(false);
    }
  }, [billing, pendingDowngradePlanId, downgradePreview]);

  const acceptRetentionDiscount = useCallback(async () => {
    setCancelDiscountLoading(true);
    try {
      const res = await fetch("/api/stripe/subscription/apply-retention-discount", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not apply discount.");
      toast.success("30% discount applied!", {
        description: "Your next billing cycle will be 30% off. Thank you for staying!",
      });
      setCancelDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply discount.");
    } finally {
      setCancelDiscountLoading(false);
    }
  }, []);

  const proceedWithCancellation = useCallback(async () => {
    setCancelPortalLoading(true);
    try {
      await openStripeBillingPortal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setCancelPortalLoading(false);
      setCancelDialogOpen(false);
    }
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/stripe-display-prices", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as StripeDisplayPricesPayload;
          setDisplayPrices(data);
          return;
        }
        setDisplayPrices(buildUsdStripeDisplayPricesFallback(null));
      } catch {
        if (!cancelled) setDisplayPrices(buildUsdStripeDisplayPricesFallback(null));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSubscriptionCheckout(planIdCheckout: string) {
    setCheckoutLoading(planIdCheckout);
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

  function priceFor(plan: PlanDef): { mainLabel: string; sub: string } | null {
    if (!displayPrices) return null;
    const cur = displayPrices.currency;
    const sp = displayPrices.subscriptions[plan.id as SubscriptionPlanId];
    if (billing === "monthly") {
      const formatted = sp?.monthly?.formatted;
      return {
        mainLabel: formatted ?? formatMoneyAmount(plan.monthly, cur),
        sub: "Billed every month",
      };
    }
    const yearly = sp?.yearly;
    if (yearly) {
      return {
        mainLabel: yearly.perMonthFormatted,
        sub: `Billed yearly (${yearly.formatted}/yr).`,
      };
    }
    const perMonthEquiv = plan.monthly * 0.7;
    const yearlyTotal = plan.monthly * 8.4;
    return {
      mainLabel: formatMoneyAmount(perMonthEquiv, cur),
      sub: `Billed yearly (${formatMoneyAmount(yearlyTotal, cur)}/yr).`,
    };
  }

  const billingPricesReady = displayPrices !== null;

  function isModelIncluded(planIdRaw: string, row: (typeof SUBSCRIPTION_MODEL_MATRIX_ROWS)[number]): boolean {
    const planId = (planIdRaw === "free" ? "free" : planIdRaw) as AccountPlanId;
    const r = planRank(planId);
    const idx = Math.max(0, Math.min(3, r - 1));
    return row.tiers[idx];
  }

  const isSubscribed = planId !== "free";

  const planGridClass = "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <StudioShell>
      <div className="relative min-w-0 overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[960px] -translate-x-1/2 rounded-full bg-violet-600/14 blur-[130px]" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-indigo-600/10 blur-[90px]" />

        <div className="relative mx-auto max-w-6xl space-y-14 px-5 py-10 md:px-8 md:py-12">
          <header className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">Subscription</p>
            <h1 className="mt-3 bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl md:text-[2.75rem] md:leading-[1.08]">
              Grow with a plan that keeps up
            </h1>
            <p className="mt-4 text-xs text-white/38">
              Need a one-time boost instead?{" "}
              <Link
                href="/credits"
                className="font-medium text-violet-300/95 underline-offset-4 transition hover:text-violet-200 hover:underline"
              >
                Credit packs
              </Link>
            </p>

            <div className="mt-10 flex justify-center">
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
                    "relative rounded-full px-6 py-2.5 pr-8 text-sm font-semibold transition-all duration-200",
                    billing === "yearly"
                      ? "bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
                      : "text-white/45 hover:text-white/75",
                  )}
                >
                  Yearly
                  <YearlyToggleSaveBadge className="-right-1 -top-2.5" />
                </button>
              </div>
            </div>
          </header>

          <section>
            <div className={cn("mx-auto grid max-w-6xl items-stretch gap-5 pt-2", planGridClass)}>
              {PLANS.map((plan) => {
                const priceLabels = priceFor(plan);
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

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative flex h-full min-h-0 flex-col rounded-2xl border p-6 transition-all duration-300",
                      isCurrentPlanCard
                        ? "border-emerald-400/45 bg-gradient-to-b from-emerald-600/[0.14] via-[#0b0914] to-[#06070d] shadow-[0_0_40px_rgba(16,185,129,0.12)]"
                        : plan.highlight
                          ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.18] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14),0_8px_0_0_rgba(76,29,149,0.4)] xl:scale-[1.02]"
                          : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    <div className="mb-2 flex min-h-[2.25rem] flex-wrap items-start gap-1.5">
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
                    </div>

                    <div className="min-h-0">
                      <h2 className="text-xl font-bold leading-tight text-white">{plan.name}</h2>
                      <PlanCardDescription plan={plan} />
                    </div>

                    <div className="mt-2 min-h-0">
                      {billingPricesReady && priceLabels ? (
                        <>
                          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                            <span className="text-4xl font-extrabold tabular-nums leading-none text-white md:text-5xl">
                              {priceLabels.mainLabel}
                            </span>
                            <span className="text-sm font-semibold leading-none text-white/55 md:text-base">/mo</span>
                          </div>
                          <p className="mt-0.5 text-xs leading-tight text-white/38">{priceLabels.sub}</p>
                        </>
                      ) : (
                        <SubscriptionPlanPriceSkeleton />
                      )}
                    </div>

                    <Button
                      type="button"
                      disabled={
                        Boolean(checkoutLoading) ||
                        exactPlanAndBilling ||
                        (isSameTier && serverSubBilling === "pending") ||
                        Boolean(downgradePreviewLoading && pendingDowngradePlanId === plan.id)
                      }
                      onClick={() => {
                        if (isLowerTier) {
                          void openDowngradeDialog(plan.id);
                          return;
                        }
                        void startSubscriptionCheckout(plan.id);
                      }}
                      className={cn(
                        "mt-3 h-11 w-full shrink-0 rounded-xl text-sm font-bold transition-all",
                        exactPlanAndBilling
                          ? "cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/40 shadow-none hover:bg-white/[0.06]"
                          : isLowerTier
                            ? "border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                            : plan.highlight
                              ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
                              : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === plan.id ? (
                        "Redirecting…"
                      ) : downgradePreviewLoading && pendingDowngradePlanId === plan.id ? (
                        "Loading…"
                      ) : isSameTier && serverSubBilling === "pending" ? (
                        "Loading…"
                      ) : exactPlanAndBilling ? (
                        "Current plan"
                      ) : isLowerTier ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          Downgrade
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
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

                    <ul className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 border-t border-white/10 pt-4 text-left text-xs text-white/72">
                      <li className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-200">
                          <Coins className="h-3 w-3" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="font-semibold text-white">{plan.credits.toLocaleString()} credits</span>
                        </span>
                      </li>
                      <li className="pl-1 text-white/50">
                        Up to {Number(plan.usage.images).toLocaleString()} AI images (Nanobanana)
                      </li>
                      <li className="pl-1 text-white/50">
                        Up to {Number(plan.usage.videos).toLocaleString()} AI videos (Sora 2)
                      </li>
                      <li className="pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
                        Included models
                      </li>
                      <li className="pl-1 text-white/55">
                        <div className="space-y-1.5">
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
            <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-8">
              <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
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
                    <h3 className="mt-2 text-2xl font-bold text-white">{planDisplayName}</h3>

                    {isSubscribed ? (
                      <div className="mt-3">
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

                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white/48">
                      {isSubscribed
                        ? "Your monthly credits refresh with your plan. Use them across Link to Ad, Image, and Video in the studio."
                        : "You’re on the free tier. Add a subscription for monthly credits or buy packs on the Credits page."}
                    </p>

                    {isSubscribed ? (
                      <div className="mt-4 flex flex-col gap-3">
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
