"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CreditPack = {
  key: string;
  price: string;
  title: string;
  description: string;
  badge?: string;
  features: string[];
  ctaHref: string;
};

const creditPacks: CreditPack[] = [
  {
    key: "starter",
    price: "$30",
    title: "💳 Starter",
    description: "Perfect to test & launch your first ads",
    features: ["Up to 6 high-converting ads", "Up to 25 AI videos", "Up to 300 AI images"],
    ctaHref: "/signin?pack=starter",
  },
  {
    key: "growth",
    price: "$60",
    title: "💳 Growth",
    description: "For consistent content & scaling",
    features: ["Up to 12 high-converting ads", "Up to 50 AI videos", "Up to 700 AI images"],
    ctaHref: "/signin?pack=growth",
  },
  {
    key: "most-popular",
    price: "$120",
    title: "💳 Most Popular ⭐",
    description: "Best balance for serious creators",
    badge: "BEST BALANCE",
    features: ["Up to 28 high-converting ads", "Up to 120 AI videos", "Up to 1500 AI images"],
    ctaHref: "/signin?pack=most-popular",
  },
  {
    key: "pro",
    price: "$240",
    title: "💳 Pro",
    description: "For heavy users & brands",
    features: ["Up to 60 high-converting ads", "Up to 260 AI videos", "Up to 3500 AI images"],
    ctaHref: "/signin?pack=pro",
  },
  {
    key: "scale",
    price: "$480",
    title: "💳 Scale",
    description: "For teams & aggressive scaling",
    badge: "BEST VALUE",
    features: ["Up to 140 high-converting ads", "Up to 600 AI videos", "Up to 8000 AI images"],
    ctaHref: "/signin?pack=scale",
  },
];

export default function CreditsPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const subtitle = useMemo(() => {
    return "Manage your subscription and choose a plan that fits your needs.";
  }, []);

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed left-1/2 top-0 -z-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Subscription</h1>
            <p className="max-w-2xl text-sm text-white/60">{subtitle}</p>

            <div className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition-all",
                  billingCycle === "monthly" ? "bg-violet-400 text-black shadow" : "text-white/60 hover:text-white",
                ].join(" ")}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition-all",
                  billingCycle === "yearly" ? "bg-violet-400 text-black shadow" : "text-white/60 hover:text-white",
                ].join(" ")}
              >
                Yearly
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {creditPacks.map((p) => {
            const isFeatured = p.badge === "BEST VALUE" || p.key === "most-popular";
            const rightBadgeColor = p.badge === "BEST VALUE" ? "bg-violet-500/20 border-violet-400/30 text-violet-200" : "bg-violet-400/20 border-violet-200/30 text-violet-200";

            return (
              <div
                key={p.key}
                className={[
                  "relative overflow-hidden rounded-2xl border p-5 transition-all",
                  isFeatured
                    ? "border-violet-500/30 bg-gradient-to-br from-violet-500/18 to-transparent shadow-[0_0_0_1px_rgba(139,92,246,0.18)] hover:shadow-[0_0_60px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:border-violet-500/25 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {p.badge ? (
                  <div className={`absolute right-4 top-4 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide border ${rightBadgeColor}`}>
                    {p.badge}
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-extrabold leading-none">
                      {p.price}
                      <span className="ml-1 text-xs font-semibold text-white/60">/month</span>
                    </div>
                    <div className="mt-1 text-sm text-white/70">{p.title.replace(/^💳\s*/, "")}</div>
                  </div>
                </div>

                <p className="mt-3 text-sm font-semibold text-violet-200/90">{p.description}</p>

                <ul className="mt-4 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/75">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-400/15 border border-violet-400/25 text-violet-200">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  <Link
                    href={p.ctaHref}
                    className={[
                      "flex h-10 w-full items-center justify-center rounded-xl border font-semibold transition-all",
                      isFeatured
                        ? "border-violet-200/30 bg-violet-400 text-black hover:bg-violet-300"
                        : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                    ].join(" ")}
                  >
                    Subscribe
                  </Link>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white/85">Current Plan</div>
              <div className="mt-2 rounded-2xl border border-white/10 bg-[#0b0912]/70 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold">Active Subscription</div>
                    <p className="mt-1 text-sm text-white/60">
                      You currently have an active subscription with full access to your plan benefits.
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-xs font-bold text-emerald-200">
                    Active
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/50">0 credits</div>
                    <div className="mt-2 text-sm font-semibold text-white/80">
                      0
                      <span className="text-xs text-white/50"> credits available</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/50">Billing cycle</div>
                    <div className="mt-2 text-sm font-semibold text-white/80">
                      {billingCycle === "monthly" ? "Monthly" : "Yearly"}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      toast("Cancel subscription is not connected yet.", { duration: 2500 });
                    }}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-red-500/90 text-white font-semibold hover:bg-red-500"
                  >
                    Cancel Subscription
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-white/40">
          Demo UI. Connect plans & checkout to your payment provider when ready.
        </footer>
      </main>
    </div>
  );
}

