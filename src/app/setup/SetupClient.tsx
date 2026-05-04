"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Coins,
  Film,
  Gem,
  Image as ImageIcon,
  Link2,
  Mic,
  MousePointerClick,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { SubscriptionPlanFeatureList } from "@/app/_components/SubscriptionPlanFeatureList";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { DATAFAST_GOALS, trackDatafastGoal } from "@/lib/analytics/datafastGoals";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import { sectionToPath } from "@/lib/studioPaths";

type Currency = "usd" | "eur";

export type SetupClientProps = {
  /** When true, used inside `/onboarding` (no full-page chrome / duplicate backgrounds). */
  embedded?: boolean;
};

type PlanDef = {
  id: SubscriptionPlanId;
  name: string;
  description: string;
  monthly: number;
  credits: number;
  badge?: string;
  highlight?: boolean;
};

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Learn the workflow and launch your first campaigns.",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Popular",
    description: "The plan most teams pick once content is weekly.",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Scale creatives without hitting limits every few days.",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
  },
  {
    id: "scale",
    name: "Scale",
    description: "Agencies and brands running multiple products at once.",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
  },
];

export default function SetupClient({ embedded = false }: SetupClientProps) {
  const [currency, setCurrency] = useState<Currency>("usd");
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [displayPrices, setDisplayPrices] = useState<StripeDisplayPricesPayload | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/billing/stripe-display-prices", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as StripeDisplayPricesPayload;
          setDisplayPrices(data);
          setCurrency((data.currency as Currency) ?? "usd");
        } else {
          setDisplayPrices(buildUsdStripeDisplayPricesFallback(null));
        }
      } catch {
        setDisplayPrices(buildUsdStripeDisplayPricesFallback(null));
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancel") {
      toast.message("Checkout cancelled, you can try again below.");
      const clearPath = embedded ? "/onboarding?step=setup" : "/setup";
      window.history.replaceState({}, "", clearPath);
    }
  }, [embedded]);

  useEffect(() => {
    trackDatafastGoal(DATAFAST_GOALS.trial_view_setup, {
      surface: embedded ? "onboarding" : "setup",
    });
  }, [embedded]);

  function startForFree() {
    trackDatafastGoal(DATAFAST_GOALS.onboarding_next_clicked, {
      step: "setup_start_free",
      surface: embedded ? "onboarding" : "setup",
    });
    window.location.href = sectionToPath("link_to_ad");
  }

  async function startPlanCheckout(planId: string) {
    setPlanLoading(planId);
    trackDatafastGoal(DATAFAST_GOALS.subscription_initiate_checkout, {
      plan_id: planId,
      billing: "monthly",
      surface: embedded ? "onboarding" : "setup",
    });
    try {
      const res = await fetch("/api/stripe/checkout/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billing: "monthly",
          ...(embedded ? { fromOnboarding: true } : {}),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setPlanLoading(null);
    }
  }

  function planMonthlyLabel(plan: { id: string; monthly: number }): string {
    if (!displayPrices) return "";
    const sp = displayPrices.subscriptions[plan.id as SubscriptionPlanId];
    const fmt = sp?.monthly?.formatted;
    return fmt ?? formatMoneyAmount(plan.monthly, currency);
  }

  const pricesReady = displayPrices !== null;

  return (
    <div
      className={cn(
        "flex flex-col items-center text-white",
        embedded
          ? "w-full bg-transparent px-0 py-2 sm:py-3"
          : "min-h-[100dvh] bg-[#050507] px-4 py-6 sm:py-8",
      )}
    >
      {!embedded ? (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[130px]" />
          <div className="absolute -left-32 top-1/3 h-56 w-56 rounded-full bg-indigo-600/8 blur-[80px]" />
        </div>
      ) : null}

      <div className="relative w-full max-w-7xl">
        {/* Header */}
        <header className={cn("text-center", embedded ? "mb-4" : "mb-6")}>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400/80">
            Welcome aboard
          </p>
          <h1 className="mt-2 bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Your unfair creative advantage starts now
          </h1>
        </header>

        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={startForFree}
            className="h-12 w-full max-w-[360px] rounded-2xl border border-violet-200/30 bg-violet-400 text-base font-extrabold text-black shadow-[0_7px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.9),0_0_34px_rgba(167,139,250,0.45)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
          >
            Start for Free
          </button>
        </div>

        {/* Plan cards, 4 tiers (Starter → Scale) */}
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-[repeat(4,minmax(15.75rem,1fr))]">
          {PLANS.map((plan) => {
            const isHighlight = Boolean(plan.highlight);
            const badge = plan.badge;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex h-full min-w-0 flex-col rounded-2xl border p-5 transition-all sm:p-6",
                  isHighlight
                    ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.16] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/18",
                )}
              >
                {badge ? (
                  <span className="mb-3 inline-block self-start rounded-full border border-violet-400/45 bg-violet-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100">
                    {badge}
                  </span>
                ) : (
                  <span className="mb-3 block h-[22px]" aria-hidden />
                )}

                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="mt-0.5 text-xs leading-snug text-white/40 sm:mt-1 sm:min-h-[2.5rem]">
                  {plan.description}
                </p>

                <div className="mt-1 sm:mt-4">
                  {pricesReady ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-[2rem] font-extrabold tabular-nums text-white sm:text-3xl">
                        {planMonthlyLabel(plan)}
                      </span>
                      <span className="text-sm text-white/40">/mo</span>
                    </div>
                  ) : (
                    <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
                  )}
                </div>

                <button
                  type="button"
                  disabled={planLoading !== null}
                  onClick={() => void startPlanCheckout(plan.id)}
                  className={cn(
                    "mt-5 h-10 w-full shrink-0 rounded-xl text-sm font-semibold transition-all",
                    isHighlight
                      ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_5px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_7px_0_0_rgba(76,29,149,0.9)] active:translate-y-0.5 active:shadow-none"
                      : "border border-white/15 bg-white/8 text-white hover:bg-white/12",
                  )}
                >
                  {planLoading === plan.id ? (
                    "Redirecting…"
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Subscribe <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>

                <SubscriptionPlanFeatureList
                  planId={plan.id}
                  credits={plan.credits}
                  billingCurrency={currency}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={startForFree}
            className="h-12 w-full max-w-[360px] rounded-2xl border border-white/15 bg-white/[0.06] text-base font-extrabold text-white/90 transition hover:bg-white/[0.09] hover:text-white"
          >
            Start for Free
          </button>
        </div>
      </div>
    </div>
  );
}
