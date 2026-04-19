"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Coins, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";

/** Credits granted by the $1 trial */
const TRIAL_CREDITS = 30;

type Currency = "usd" | "eur";

function CurrencySymbol({ currency }: { currency: Currency }) {
  return <>{currency === "eur" ? "€" : "$"}</>;
}

const PLANS = [
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
    badge: "Most popular",
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
] as const;

export default function SetupClient() {
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
      toast.message("Checkout cancelled — you can try again below.");
      window.history.replaceState({}, "", "/setup");
    }
  }, []);

  async function startTrialCheckout() {
    setTrialLoading(true);
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
    try {
      const res = await fetch("/api/stripe/checkout/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billing: "monthly" }),
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
    <div className="flex min-h-[100dvh] flex-col items-center bg-[#050507] px-4 py-14 text-white">
      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[130px]" />
        <div className="absolute -left-32 top-1/3 h-56 w-56 rounded-full bg-indigo-600/8 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-3xl">
        {/* Header */}
        <header className="mb-12 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400/80">
            Almost there
          </p>
          <h1 className="mt-3 bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-3 text-sm text-white/40">
            Start with a <span className="font-semibold text-white/65">
              {currency === "eur" ? "1€" : "$1"} trial
            </span> — or go straight to a full subscription.
          </p>
        </header>

        {/* $1 Trial card — hero */}
        {trialAvailable && (
          <div className="mb-8 relative overflow-hidden rounded-3xl border border-violet-400/35 bg-gradient-to-br from-violet-600/20 via-violet-800/10 to-transparent p-8 shadow-[0_0_60px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]">
            {/* Glow blob */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-200">
                  <Sparkles className="h-3 w-3" />
                  Recommended for new users
                </div>
                <h2 className="mt-2 text-2xl font-extrabold text-white">
                  Try it for{" "}
                  <span className="text-violet-300">
                    <CurrencySymbol currency={currency} />1
                  </span>
                </h2>
                <p className="mt-1 text-sm text-white/50">
                  Get {TRIAL_CREDITS} credits to explore the Link to Ad workflow — from product scan to
                  UGC images. No commitment.
                </p>

                <ul className="mt-4 space-y-2">
                  {[
                    `${TRIAL_CREDITS} credits (worth ${currency === "eur" ? "€4.50" : "$4.50"})`,
                    "Full Link to Ad workflow (scan → angles → images)",
                    "See your product transformed into UGC content",
                    "Upgrade to generate videos anytime",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-[13px] text-white/65">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-violet-300">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 text-center sm:text-right">
                <div className="mb-4 inline-block">
                  <div className="text-5xl font-extrabold tabular-nums text-white">
                    <CurrencySymbol currency={currency} />1
                  </div>
                  <div className="mt-0.5 text-xs text-white/35">one-time · no recurring charge</div>
                </div>
                <button
                  type="button"
                  disabled={trialLoading}
                  onClick={startTrialCheckout}
                  className="flex h-12 w-full min-w-[180px] items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-bold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60"
                >
                  {trialLoading ? (
                    "Redirecting…"
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Start for <CurrencySymbol currency={currency} />1
                    </>
                  )}
                </button>
                <p className="mt-2 text-[11px] text-white/28">Powered by Stripe · Secure payment</p>
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

        {/* Plan cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isHighlight = "highlight" in plan && plan.highlight;
            const badge = "badge" in plan ? plan.badge : undefined;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  isHighlight
                    ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.16] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/18",
                )}
              >
                {badge && (
                  <span className="mb-3 inline-block self-start rounded-full border border-violet-400/45 bg-violet-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100">
                    {badge}
                  </span>
                )}

                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="mt-1 text-xs leading-snug text-white/40">{plan.description}</p>

                <div className="mt-4">
                  {pricesReady ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold tabular-nums text-white">
                        {planMonthlyLabel(plan)}
                      </span>
                      <span className="text-sm text-white/40">/mo</span>
                    </div>
                  ) : (
                    <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
                  )}
                  <p className="mt-0.5 text-xs text-white/30">Billed monthly · cancel anytime</p>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[12px] text-white/50">
                  <Coins className="h-3.5 w-3.5 text-violet-300/70" />
                  <span>
                    <span className="font-semibold text-white/80">{plan.credits.toLocaleString()} credits</span>
                    {" "}/ month
                  </span>
                </div>

                <button
                  type="button"
                  disabled={planLoading !== null}
                  onClick={() => void startPlanCheckout(plan.id)}
                  className={cn(
                    "mt-5 h-10 w-full rounded-xl text-sm font-semibold transition-all",
                    isHighlight
                      ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_5px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_7px_0_0_rgba(76,29,149,0.9)] active:translate-y-0.5 active:shadow-none"
                      : "border border-white/15 bg-white/8 text-white hover:bg-white/12",
                  )}
                >
                  {planLoading === plan.id ? (
                    "Redirecting…"
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      Subscribe <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Skip */}
        <div className="mt-10 text-center">
          <a
            href="/"
            className="text-xs text-white/25 underline-offset-4 transition hover:text-white/50 hover:underline"
          >
            Skip for now and explore the free tier
          </a>
        </div>
      </div>
    </div>
  );
}
