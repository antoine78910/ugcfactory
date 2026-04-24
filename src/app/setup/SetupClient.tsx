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
import { STRIPE_ONE_DOLLAR_TRIAL_CREDIT_GRANT, SUBSCRIPTIONS } from "@/lib/pricing";
import { DATAFAST_GOALS, trackDatafastGoal } from "@/lib/analytics/datafastGoals";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";

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
  const [trialLoading, setTrialLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [displayPrices, setDisplayPrices] = useState<StripeDisplayPricesPayload | null>(null);
  const [trialAvailable, setTrialAvailable] = useState(true);

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

  async function startTrialCheckout() {
    setTrialLoading(true);
    trackDatafastGoal(DATAFAST_GOALS.trial_initiate_checkout, {
      currency,
      surface: embedded ? "onboarding" : "setup",
    });
    try {
      const res = await fetch("/api/stripe/checkout/trial", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start trial");
      setTrialAvailable(false);
    } finally {
      setTrialLoading(false);
    }
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

  const trialAmountLabel = formatMoneyAmount(1, currency);

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

        {/* $1 Trial card, hero */}
        {trialAvailable && (
          <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0d111b] via-[#090b12] to-[#06070d] p-5 shadow-[0_0_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
            {/* Glow blob */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />

            <div className="relative">
              <div className="flex flex-col">
                <h2 className="text-xl font-extrabold text-white sm:text-2xl">
                  Unleash the whole machine for {trialAmountLabel}
                </h2>
                <p className="mt-1 text-[13px] text-white/50 sm:text-sm">
                  Plug your product, walk away, come back to winning videos, avatars and images ready to run.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { icon: Coins, label: `${STRIPE_ONE_DOLLAR_TRIAL_CREDIT_GRANT} credits, on us` },
                    { icon: Film, label: "Videos · avatars · visuals" },
                    { icon: Clock3, label: "24h full access" },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/75"
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-col items-stretch gap-3 md:flex-row md:items-stretch md:justify-start md:gap-3">
                  <ul className="space-y-1.5 text-[13px] text-white/75 sm:text-sm">
                    {[
                      { icon: Target, label: "Winning angles, tailored to your offer" },
                      { icon: Users, label: "UGC that talks like a real customer" },
                      { icon: MousePointerClick, label: "Hooks and CTAs built to convert" },
                      { icon: Gem, label: "The most natural & realistic AI UGC" },
                    ].map(({ icon: Icon, label }) => (
                      <li key={label} className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-200">
                          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                        </span>
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Funnel connector, desktop only — 4 converging streams → glowing node → arrow */}
                  <div className="hidden shrink-0 md:block" aria-hidden>
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="block h-full w-20"
                    >
                      <defs>
                        <linearGradient id="funnelGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.15" />
                          <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.75" />
                          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="1" />
                        </linearGradient>
                        <radialGradient id="funnelNode" cx="0.5" cy="0.5" r="0.5">
                          <stop offset="0%" stopColor="#ddd6fe" stopOpacity="1" />
                          <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.6" />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                        </radialGradient>
                      </defs>

                      {/* 4 streams, one per bullet, converging at (62,50) */}
                      <path
                        d="M 0 12 C 30 12 45 50 62 50"
                        stroke="url(#funnelGrad)"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 37 C 35 37 50 50 62 50"
                        stroke="url(#funnelGrad)"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 63 C 35 63 50 50 62 50"
                        stroke="url(#funnelGrad)"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 88 C 30 88 45 50 62 50"
                        stroke="url(#funnelGrad)"
                        strokeWidth="1.2"
                        fill="none"
                        strokeLinecap="round"
                      />

                      {/* Glow halo + core node at convergence */}
                      <circle cx="62" cy="50" r="8" fill="url(#funnelNode)" />
                      <circle cx="62" cy="50" r="2" fill="#ede9fe" />

                      {/* Arrow shaft + head */}
                      <line
                        x1="62"
                        y1="50"
                        x2="94"
                        y2="50"
                        stroke="#c4b5fd"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 88 43 L 96 50 L 88 57"
                        stroke="#c4b5fd"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <div className="relative hidden self-center overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/20 via-violet-500/8 to-transparent px-4 py-3 shadow-[0_0_30px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm md:block md:max-w-[240px]">
                    {/* Incoming glow on the left edge (desktop), meets the arrow tip */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 rounded-full bg-violet-400/30 blur-2xl md:block"
                    />
                    {/* Decorative blob top-right */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-400/15 blur-2xl"
                    />

                    <div className="relative flex items-start gap-2.5">
                      <span className="relative mt-1 hidden h-2 w-2 shrink-0 md:inline-flex">
                        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/70" />
                        <span className="relative h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.9)]" />
                      </span>
                      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-300 drop-shadow-[0_0_4px_rgba(196,181,253,0.5)] md:hidden" />

                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-white/95 sm:text-sm">
                          All of that,{" "}
                          <span className="bg-gradient-to-r from-violet-200 via-white to-violet-200 bg-clip-text font-bold text-transparent">
                            automatically
                          </span>
                          .
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-white/55">
                          Just paste your link, we handle the rest.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="order-2 mt-3 grid gap-2 sm:grid-cols-3 md:order-1">
                  {[
                    {
                      icon: Film,
                      title: "Ad Videos",
                      text: "Cinematic clips that feel shot, not generated.",
                    },
                    {
                      icon: Mic,
                      title: "Avatar Ads",
                      text: "Lifelike spokespeople selling on your behalf.",
                    },
                    {
                      icon: ImageIcon,
                      title: "Ad Images",
                      text: "Bold visuals engineered to break the feed.",
                    },
                  ].map(({ icon: Icon, title, text }) => (
                    <div
                      key={title}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-violet-300" />
                        <p className="text-xs font-semibold text-white">{title}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/50">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="order-1 mt-4 flex flex-col items-center md:order-2">
                  <button
                    type="button"
                    disabled={trialLoading}
                    onClick={startTrialCheckout}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-6 text-sm font-extrabold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[320px]"
                  >
                    {trialLoading ? (
                      "Redirecting…"
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Generate My First Ad
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-white/28">one-time · no recurring charge</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="mb-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/8" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/28">
            or choose a full plan
          </span>
          <div className="h-px flex-1 bg-white/8" />
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
      </div>
    </div>
  );
}
