"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS } from "@/lib/pricing";

type Billing = "monthly" | "yearly";

type PlanDef = {
  id: string;
  name: string;
  badge?: string;
  description: string;
  monthly: number;
  credits: number;
  /** Rough monthly capacity hints */
  usage: { ads: string; videos: string; images: string };
  cardClass: string;
  buttonClass: string;
};

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For beginners & testing",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
    usage: { ads: "~6–7 ads", videos: "~30 videos", images: "~350 images" },
    cardClass: "border-white/10 bg-white/[0.02]",
    buttonClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "growth",
    name: "Growth",
    badge: "MOST POPULAR ⭐",
    description: "Most popular",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: { ads: "~15–17 ads", videos: "~70 videos", images: "~900 images" },
    cardClass:
      "border-sky-400/35 bg-gradient-to-b from-sky-500/15 via-[#0b0912] to-[#0b0912] shadow-[0_0_40px_rgba(56,189,248,0.12)]",
    buttonClass: "bg-sky-400 text-white hover:bg-sky-300",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For serious scaling",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: { ads: "~35–40 ads", videos: "~150 videos", images: "~2000 images" },
    cardClass: "border-white/10 bg-white/[0.02]",
    buttonClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "scale",
    name: "Scale",
    description: "For power users & brands",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: { ads: "~80–90 ads", videos: "~350 videos", images: "~4500 images" },
    cardClass:
      "border-violet-500/40 bg-gradient-to-b from-violet-600/18 via-[#0b0912] to-[#0b0912] shadow-[0_0_40px_rgba(139,92,246,0.15)]",
    buttonClass: "bg-violet-500 text-white hover:bg-violet-400",
  },
];

type ModelRow = {
  label: string;
  badges?: { text: string; className: string }[];
  /** which plan tiers include this (0=Starter … 3=Scale) */
  tiers: [boolean, boolean, boolean, boolean];
};

const MODEL_ROWS: ModelRow[] = [
  { label: "Flux Image Models", tiers: [true, true, true, true] },
  {
    label: "Flux LoRA",
    badges: [{ text: "TRAINING", className: "bg-amber-900/50 text-amber-200 border-amber-700/40" }],
    tiers: [false, true, true, true],
  },
  { label: "Nano Banana 2", tiers: [false, true, true, true] },
  { label: "Z-image Turbo", tiers: [false, true, true, true] },
  { label: "Kling 2.1 Master", tiers: [false, false, true, true] },
  { label: "Kling 2.5 Turbo", tiers: [false, false, true, true] },
  { label: "Kling O1", tiers: [false, false, true, true] },
  { label: "Seedance 1.5 Pro", tiers: [false, false, true, true] },
  { label: "Veo 3.1", tiers: [false, false, true, true] },
  { label: "Veo 3.1 Fast", tiers: [false, false, true, true] },
  { label: "WAN 2.6", tiers: [false, false, true, true] },
  {
    label: "Seedream 4.5",
    badges: [{ text: "4K", className: "bg-violet-500/20 text-violet-200 border-violet-400/30" }],
    tiers: [false, false, false, true],
  },
  {
    label: "Kling 2.6 Pro",
    badges: [{ text: "4K", className: "bg-violet-500/20 text-violet-200 border-violet-400/30" }],
    tiers: [false, false, false, true],
  },
  {
    label: "Kling 3.0 Pro",
    badges: [
      { text: "4K", className: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
      { text: "VOICE", className: "bg-teal-500/20 text-teal-200 border-teal-400/30" },
    ],
    tiers: [false, false, false, true],
  },
  {
    label: "Sora 2 Pro",
    badges: [
      { text: "4K", className: "bg-violet-500/20 text-violet-200 border-violet-400/30" },
      { text: "VOICE", className: "bg-teal-500/20 text-teal-200 border-teal-400/30" },
    ],
    tiers: [false, false, false, true],
  },
];

/** Top rows: Image / Video upscale per tier */
const UPSCALE_TOP: { label: string; tiers: [boolean, boolean, boolean, boolean] }[] = [
  { label: "Image Upscale", tiers: [false, false, true, true] },
  { label: "Video Upscale", tiers: [false, false, false, true] },
];

function CellIcon({ ok, accent }: { ok: boolean; accent?: "sky" | "violet" | "amber" }) {
  if (!ok) return <X className="mx-auto h-4 w-4 text-white/20" strokeWidth={2} />;
  const cls =
    accent === "sky"
      ? "text-sky-300"
      : accent === "violet"
        ? "text-violet-300"
        : accent === "amber"
          ? "text-amber-200"
          : "text-white";
  return <Check className={cn("mx-auto h-4 w-4", cls)} strokeWidth={2.5} />;
}

function tierAccent(ti: number): "sky" | "violet" | "amber" | undefined {
  if (ti === 1) return "sky"; // Growth
  if (ti === 2) return "amber"; // Pro
  if (ti === 3) return "violet"; // Scale
  return undefined;
}

function tierColBg(ti: number): string {
  if (ti === 1) return "bg-sky-500/[0.03]";
  if (ti === 2) return "bg-amber-500/[0.04]";
  if (ti === 3) return "bg-violet-500/[0.04]";
  return "";
}

export default function SubscriptionPage() {
  const [billing, setBilling] = useState<Billing>("monthly");

  const subtitle = useMemo(
    () => "Manage your subscription and choose a plan that fits your needs.",
    [],
  );

  function priceFor(plan: PlanDef) {
    if (billing === "monthly") {
      return { mainLabel: String(plan.monthly), sub: "Billed monthly" };
    }
    // Yearly: -50% vs paying 12× monthly → pay 6× monthly / year, i.e. half per month.
    const perMonthEquiv = plan.monthly * 0.5;
    const yearlyTotal = plan.monthly * 6;
    const mainLabel = Number.isInteger(perMonthEquiv)
      ? String(perMonthEquiv)
      : perMonthEquiv.toFixed(2);
    return {
      mainLabel,
      sub: `Billed yearly ($${yearlyTotal.toLocaleString("en-US")}/yr) — save 50%`,
    };
  }

  return (
    <StudioShell>
      <div className="min-w-0 space-y-14 px-6 py-8 md:px-10">
        {/* Hero + toggle — centered like mockup */}
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Subscription</h1>
          <p className="mt-2 text-sm text-white/55 sm:text-base">{subtitle}</p>
          <p className="mt-3 text-xs text-white/40">
            One-off credit packs stay on{" "}
            <Link href="/credits" className="text-violet-300 underline-offset-2 hover:underline">
              Credits
            </Link>
            .
          </p>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold transition-all",
                  billing === "monthly" ? "bg-white/15 text-white shadow-sm" : "text-white/50 hover:text-white/80",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling("yearly")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold transition-all",
                  billing === "yearly" ? "bg-white/15 text-white shadow-sm" : "text-white/50 hover:text-white/80",
                )}
              >
                Yearly <span className="text-violet-300/90">(-50%)</span>
              </button>
            </div>
          </div>
        </header>

        <p className="mx-auto max-w-3xl text-center text-sm font-semibold tracking-wide text-violet-200/90">
          💳 TON SETUP IDÉAL
        </p>

        {/* Four plan cards */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const { mainLabel, sub } = priceFor(plan);
            const isPopular = plan.badge?.includes("POPULAR");

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  plan.cardClass,
                )}
              >
                {plan.badge ? (
                  <div
                    className={cn(
                      "absolute left-1/2 top-0 max-w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-center text-[9px] font-bold leading-tight tracking-wide sm:text-[10px] sm:tracking-widest",
                      isPopular
                        ? "border-sky-400/40 bg-sky-500/20 text-sky-200"
                        : "border-fuchsia-400/40 bg-fuchsia-500/20 text-fuchsia-100",
                    )}
                  >
                    {plan.badge}
                  </div>
                ) : null}

                <div className="mt-2">
                  <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                  <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-white/50">{plan.description}</p>
                </div>

                <div className="mt-5">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-base" aria-hidden>
                      🔁
                    </span>
                    <span className="text-3xl font-extrabold text-white">${mainLabel}</span>
                    <span className="text-sm font-medium text-white/45">/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-white/40">{sub}</p>
                </div>

                <button
                  type="button"
                  onClick={() => toast.message("Checkout", { description: "Connect Stripe / billing when ready." })}
                  className={cn("mt-6 h-11 w-full rounded-xl text-sm font-bold transition-colors", plan.buttonClass)}
                >
                  Subscribe
                </button>

                <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-left text-sm text-white/85">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0" aria-hidden>
                      💳
                    </span>
                    <span className="font-semibold text-white">
                      {plan.credits.toLocaleString()} credits / month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0" aria-hidden>
                      🎬
                    </span>
                    <span>{plan.usage.ads}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0" aria-hidden>
                      🎥
                    </span>
                    <span>{plan.usage.videos}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0" aria-hidden>
                      🖼️
                    </span>
                    <span>{plan.usage.images}</span>
                  </li>
                </ul>
              </div>
            );
          })}
        </section>

        {/* Current plan — third mockup */}
        <section className="mx-auto max-w-4xl">
          <h2 className="text-lg font-bold text-white">Current Plan</h2>
          <div className="mt-3 rounded-2xl border border-white/10 bg-[#0c0d14] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                  <CreditCard className="h-5 w-5 text-white/70" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/35 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
                      Active
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-white">Active Subscription</h3>
                  <p className="mt-1 max-w-md text-sm text-white/50">
                    You currently have an active subscription with full access to your plan benefits.
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-400/90">Billing cycle</p>
                <p className="mt-1 text-lg font-bold text-white">{billing === "monthly" ? "Monthly" : "Yearly"}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-xs text-white/45">Credits</p>
                <p className="mt-1 text-sm font-semibold text-white/90">
                  0 <span className="text-xs font-normal text-white/45">credits available</span>
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-xs text-white/45">Billing</p>
                <p className="mt-1 text-sm font-semibold text-white/90">
                  {billing === "monthly" ? "Monthly billing" : "Yearly billing"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => toast("Cancel subscription is not connected yet.", { duration: 2500 })}
                className="rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-500"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        </section>

        {/* Model matrix — second mockup */}
        <section className="mx-auto max-w-6xl">
          <h2 className="text-lg font-bold text-white">Model access</h2>
          <p className="mt-1 text-sm text-white/45">Compare included models and upscaling by plan.</p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#08090e]">
            <div className="min-w-[720px]">
              {/* Header row: plan names */}
              <div
                className="grid border-b border-white/10 bg-white/[0.02]"
                style={{ gridTemplateColumns: "minmax(200px,1.2fr) repeat(4, minmax(88px,1fr))" }}
              >
                <div className="p-4 text-xs font-semibold uppercase tracking-wider text-white/35">Feature</div>
                {PLANS.map((p, i) => (
                  <div
                    key={p.id}
                    className={cn(
                      "border-l border-white/5 p-4 text-center text-xs font-bold text-white/90",
                      i === 1 && "bg-sky-500/5",
                      i === 2 && "bg-amber-500/5",
                      i === 3 && "bg-violet-500/5",
                    )}
                  >
                    {p.name}
                  </div>
                ))}
              </div>

              {UPSCALE_TOP.map((row) => (
                <div
                  key={row.label}
                  className="grid border-b border-white/5"
                  style={{ gridTemplateColumns: "minmax(200px,1.2fr) repeat(4, minmax(88px,1fr))" }}
                >
                  <div className="p-3 pl-4 text-sm text-white/70">{row.label}</div>
                  {row.tiers.map((ok, ti) => (
                    <div
                      key={ti}
                      className={cn(
                        "flex items-center justify-center border-l border-white/5 py-3",
                        tierColBg(ti),
                      )}
                    >
                      <CellIcon ok={ok} accent={tierAccent(ti)} />
                    </div>
                  ))}
                </div>
              ))}

              <div
                className="grid border-b border-white/10 bg-violet-500/5"
                style={{ gridTemplateColumns: "minmax(200px,1.2fr) repeat(4, minmax(88px,1fr))" }}
              >
                <div className="p-3 pl-4 text-xs font-bold uppercase tracking-[0.12em] text-violet-200/90">
                  Unlimited access
                </div>
                <div className="border-l border-white/5" />
                <div className="border-l border-white/5 bg-sky-500/[0.04]" />
                <div className="border-l border-white/5 bg-amber-500/[0.05]" />
                <div className="border-l border-white/5 bg-violet-500/[0.06]" />
              </div>

              {MODEL_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="grid border-b border-white/5 last:border-b-0"
                  style={{ gridTemplateColumns: "minmax(200px,1.2fr) repeat(4, minmax(88px,1fr))" }}
                >
                  <div className="flex flex-wrap items-center gap-2 p-3 pl-4 text-sm text-white/80">
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
                  {row.tiers.map((ok, ti) => (
                    <div
                      key={ti}
                      className={cn(
                        "flex items-center justify-center border-l border-white/5 py-2.5",
                        tierColBg(ti),
                      )}
                    >
                      <CellIcon ok={ok} accent={tierAccent(ti)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="pb-8 text-center text-xs text-white/35">
          Demo UI — connect plans, credits, and payment provider when ready.
        </p>
      </div>
    </StudioShell>
  );
}
