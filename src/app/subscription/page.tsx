"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Coins, CreditCard, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import { consumeCheckoutQueryParams, useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS } from "@/lib/pricing";
import { SUBSCRIPTION_MODEL_MATRIX_ROWS } from "@/lib/subscriptionModelAccess";
import {
  subscriptionPlanSortIndex,
  type SubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import type { AccountPlanId } from "@/app/_components/CreditsPlanContext";

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
  usage: { ads: string; videos: string; images: string };
  highlight?: boolean;
};

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Learn the workflow and launch your first campaigns.",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
    usage: { ads: "~6–7 ads", videos: "~30 videos", images: "~350 images" },
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Popular",
    description: "The plan most teams pick once content is weekly.",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: { ads: "~15–17 ads", videos: "~70 videos", images: "~900 images" },
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Scale creatives without hitting limits every few days.",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: { ads: "~35–40 ads", videos: "~150 videos", images: "~2 000 images" },
  },
  {
    id: "scale",
    name: "Scale",
    description: "Agencies and brands running multiple products at once.",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: { ads: "~80–90 ads", videos: "~350 videos", images: "~4 500 images" },
  },
];

function visibleSubscriptionPlans(accountPlanId: AccountPlanId): PlanDef[] {
  if (accountPlanId === "free") return PLANS;
  const minIdx = subscriptionPlanSortIndex(accountPlanId);
  if (minIdx < 0) return PLANS;
  return PLANS.filter((p) => subscriptionPlanSortIndex(p.id as SubscriptionPlanId) >= minIdx);
}

function CellIcon({ ok, accent }: { ok: boolean; accent?: "violet" | "amber" | "emerald" }) {
  if (!ok) return <X className="mx-auto h-4 w-4 text-white/15" strokeWidth={2} />;
  const cls =
    accent === "violet"
      ? "text-violet-300"
      : accent === "amber"
        ? "text-amber-200"
        : accent === "emerald"
          ? "text-emerald-300"
          : "text-white";
  return <Check className={cn("mx-auto h-4 w-4", cls)} strokeWidth={2.5} />;
}

function tierAccent(ti: number): "violet" | "amber" | "emerald" | undefined {
  if (ti === 1) return "emerald";
  if (ti === 2) return "amber";
  if (ti === 3) return "violet";
  return undefined;
}

function tierColBg(ti: number): string {
  if (ti === 1) return "bg-emerald-500/[0.04]";
  if (ti === 2) return "bg-amber-500/[0.04]";
  if (ti === 3) return "bg-violet-500/[0.05]";
  return "";
}

export default function SubscriptionPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { planId, planDisplayName } = useCreditsPlan();

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

  const isSubscribed = planId !== "free";

  const visiblePlans = useMemo(() => visibleSubscriptionPlans(planId), [planId]);
  const planColumnIndices = useMemo(
    () => visiblePlans.map((p) => subscriptionPlanSortIndex(p.id as SubscriptionPlanId)),
    [visiblePlans],
  );

  const planGridClass =
    visiblePlans.length <= 1
      ? "mx-auto max-w-md grid-cols-1"
      : visiblePlans.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : visiblePlans.length === 3
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  const matrixGridTemplate = `minmax(200px,1.2fr) repeat(${visiblePlans.length}, minmax(88px,1fr))`;

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
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                  {isSubscribed ? "Your plan & upgrades" : "Compare plans"}
                </span>
              </div>
              {isSubscribed ? (
                <p className="max-w-lg text-sm text-white/50">
                  Current plan:{" "}
                  <span className="font-semibold text-white/85">{planDisplayName}</span>
                  {visiblePlans.length > 1
                    ? ". Below are your tier and higher options only."
                    : null}
                </p>
              ) : null}
              {isSubscribed && visiblePlans.length === 1 ? (
                <p className="max-w-md text-xs text-white/40">You’re on our highest subscription tier.</p>
              ) : null}
            </div>

            <div className={cn("mx-auto grid max-w-6xl gap-5", planGridClass)}>
              {visiblePlans.map((plan) => {
                const { mainLabel, sub } = priceFor(plan);
                const isCurrentPlanCard = isSubscribed && plan.id === planId;

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-300",
                      isCurrentPlanCard
                        ? "border-emerald-400/45 bg-gradient-to-b from-emerald-600/[0.14] via-[#0b0914] to-[#06070d] shadow-[0_0_40px_rgba(16,185,129,0.12)]"
                        : plan.highlight
                          ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.18] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14),0_8px_0_0_rgba(76,29,149,0.4)] xl:scale-[1.02]"
                          : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    {isCurrentPlanCard ? (
                      <span className="absolute -top-3 left-1/2 max-w-[92%] -translate-x-1/2 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                        Current plan
                      </span>
                    ) : plan.badge ? (
                      <span className="absolute -top-3 left-1/2 max-w-[92%] -translate-x-1/2 rounded-full border border-violet-400/45 bg-violet-500/25 px-3 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-violet-100">
                        {plan.badge}
                      </span>
                    ) : null}
                    {billing === "yearly" && !isCurrentPlanCard ? (
                      <span className="pointer-events-none absolute -right-9 top-4 rotate-45 rounded-sm border border-emerald-300/45 bg-emerald-400/25 px-10 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.35)] transition-all duration-300">
                        Save 30%
                      </span>
                    ) : null}

                    <div className={cn("mt-2", plan.badge || isCurrentPlanCard ? "mt-3" : "")}>
                      <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                      <p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-white/48">{plan.description}</p>
                    </div>

                    <div className="mt-6">
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-4xl font-extrabold tabular-nums leading-none text-white md:text-5xl">
                          ${mainLabel}
                        </span>
                        <span className="text-sm font-semibold text-white/55 md:text-base">/mo</span>
                      </div>
                      <p className="mt-2 text-xs leading-snug text-white/38">{sub}</p>
                      {billing === "yearly" ? (
                        <p className="mt-2 inline-flex items-center rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                          Save 30% on yearly billing
                        </p>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      disabled={Boolean(checkoutLoading) || isCurrentPlanCard}
                      onClick={() => void startSubscriptionCheckout(plan.id)}
                      className={cn(
                        "mt-6 h-12 w-full rounded-xl text-sm font-bold transition-all",
                        isCurrentPlanCard
                          ? "cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/40 shadow-none hover:bg-white/[0.06]"
                          : plan.highlight
                            ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
                            : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === plan.id ? (
                        "Redirecting…"
                      ) : isCurrentPlanCard ? (
                        "Current plan"
                      ) : (
                        <span className="inline-flex items-center justify-center gap-2">
                          {isSubscribed ? "Upgrade" : "Subscribe"}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </Button>

                    <ul className="mt-6 space-y-3 border-t border-white/10 pt-6 text-left text-sm text-white/78">
                      <li className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-200">
                          <Coins className="h-3 w-3" aria-hidden />
                        </span>
                        <span>
                          <span className="font-semibold text-white">{plan.credits.toLocaleString()} credits</span>
                          <span className="text-white/45"> / month</span>
                        </span>
                      </li>
                      <li className="pl-1 text-white/55">
                        <span className="text-white/70">Ads:</span> {plan.usage.ads}
                      </li>
                      <li className="pl-1 text-white/55">
                        <span className="text-white/70">Video:</span> {plan.usage.videos}
                      </li>
                      <li className="pl-1 text-white/55">
                        <span className="text-white/70">Images:</span> {plan.usage.images}
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
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white/48">
                      {isSubscribed
                        ? "Your monthly credits refresh with your plan. Use them across Link to Ad, Image, and Video in the studio."
                        : "You’re on the free tier. Add a subscription for monthly credits or buy packs on the Credits page."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-6">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => window.open(BILLING_PORTAL_URL, "_blank", "noopener,noreferrer")}
                >
                  Manage billing
                </Button>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl">
            <div className="mb-6 text-center">
              <h2 className="text-lg font-bold text-white md:text-xl">Model access</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-white/45">
                Studio Image &amp; Video use the same rules as in the app. Starter has model restrictions; Growth and
                above unlock full model access.
              </p>
              <p className="mt-2 text-xs text-white/32">
                <span className="font-medium text-white/45">Free</span> (with packs) matches{" "}
                <span className="text-white/50">Starter</span> for studio models.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-violet-500/15 bg-[#07080f] shadow-[0_0_60px_rgba(139,92,246,0.06)]">
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div
                    className="grid border-b border-white/10 bg-white/[0.03]"
                    style={{ gridTemplateColumns: matrixGridTemplate }}
                  >
                    <div className="p-4 text-xs font-semibold uppercase tracking-wider text-white/35">Feature</div>
                    {visiblePlans.map((p, i) => {
                      const colIdx = planColumnIndices[i] ?? 0;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "border-l border-white/5 p-4 text-center text-xs font-bold text-white/90",
                            colIdx === 1 && "bg-violet-500/[0.06]",
                            colIdx === 2 && "bg-amber-500/[0.04]",
                            colIdx === 3 && "bg-violet-600/[0.07]",
                          )}
                        >
                          {p.name}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="grid border-b border-violet-500/15 bg-violet-500/[0.06]"
                    style={{ gridTemplateColumns: matrixGridTemplate }}
                  >
                    <div className="p-3 pl-4 text-xs font-bold uppercase tracking-[0.12em] text-violet-200/95">
                      Studio: models
                    </div>
                    {planColumnIndices.map((colIdx) => (
                      <div
                        key={`studio-head-${colIdx}`}
                        className={cn(
                          "border-l border-white/5",
                          colIdx === 1 && "bg-violet-500/[0.04]",
                          colIdx === 2 && "bg-amber-500/[0.05]",
                          colIdx === 3 && "bg-violet-600/[0.08]",
                        )}
                      />
                    ))}
                  </div>

                  {SUBSCRIPTION_MODEL_MATRIX_ROWS.map((row) => (
                    <div
                      key={row.label}
                      className="grid border-b border-white/5 last:border-b-0"
                      style={{ gridTemplateColumns: matrixGridTemplate }}
                    >
                      <div className="flex flex-wrap items-center gap-2 p-3 pl-4 text-sm text-white/78">
                        <span>{row.label}</span>
                        {row.badges?.map((b) => (
                          <span
                            key={b.text}
                            className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide", b.className)}
                          >
                            {b.text}
                          </span>
                        ))}
                      </div>
                      {planColumnIndices.map((colIdx) => {
                        const ok = row.tiers[colIdx] ?? false;
                        return (
                          <div
                            key={`${row.label}-${colIdx}`}
                            className={cn(
                              "flex items-center justify-center border-l border-white/5 py-2.5",
                              tierColBg(colIdx),
                            )}
                          >
                            <CellIcon ok={ok} accent={tierAccent(colIdx)} />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <p className="pb-6 text-center text-[11px] text-white/28">Checkout is powered by Stripe.</p>
        </div>
      </div>
    </StudioShell>
  );
}
