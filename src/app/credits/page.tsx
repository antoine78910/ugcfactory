"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import { consumeCheckoutQueryParams, useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CREDIT_PACKS } from "@/lib/pricing";

type CreditPack = {
  key: string;
  price: string;
  name: string;
  credits: number;
  description: string;
  promoLine: string;
  badge?: string;
};

const PACK_UI: Omit<CreditPack, "price" | "credits">[] = [
  {
    key: "starter",
    name: "Launch",
    description: "Ideal to test the studio and ship your first ads.",
    promoLine: "Entry pack",
  },
  {
    key: "growth",
    name: "Growth",
    description: "Steady output for creators posting every week.",
    promoLine: "Save 11%",
  },
  {
    key: "most-popular",
    name: "Boost",
    description: "The sweet spot for serious solo brands and shops.",
    badge: "Most picked",
    promoLine: "Save 20%",
  },
  {
    key: "pro",
    name: "Pro",
    description: "Heavy usage: more videos, images, and iterations.",
    promoLine: "Save 27%",
  },
  {
    key: "scale",
    name: "Scale",
    description: "Teams and agencies running volume without friction.",
    badge: "Best value",
    promoLine: "Save 36%",
  },
];

const creditPacks: CreditPack[] = PACK_UI.map((meta, i) => {
  const row = CREDIT_PACKS[i];
  if (!row) throw new Error(`CREDIT_PACKS[${i}] missing`);
  return {
    ...meta,
    price: `$${row.price_usd}`,
    credits: row.credits,
  };
});

export default function CreditsPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { planDisplayName } = useCreditsPlan();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("checkout");
    if (c === "cancel") {
      toast.message("Checkout cancelled");
      window.history.replaceState({}, "", "/credits");
      return;
    }
    if (c === "success") {
      const applied = consumeCheckoutQueryParams(window.location.pathname);
      toast.success(
        applied ? "Credits added" : "Payment received",
        applied
          ? { description: "Your balance was updated in the sidebar." }
          : {
              description:
                "If the balance did not change, check your Stripe success URL or webhooks.",
            },
      );
      if (!applied) window.history.replaceState({}, "", "/credits");
    }
  }, []);

  async function buyPack(packKey: string) {
    setCheckoutLoading(packKey);
    try {
      const res = await fetch("/api/stripe/checkout/credits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packKey,
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

  return (
    <StudioShell>
      <div className="relative min-w-0 overflow-x-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/12 blur-[120px]" />
        <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-fuchsia-600/8 blur-[100px]" />

        <div className="relative mx-auto max-w-6xl space-y-12 px-5 py-10 md:px-8 md:py-12">
          <header className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">Credits</p>
            <h1 className="mt-3 bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
              Top up and keep creating
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/50 md:text-base">
              One-off packs work with any account. Prefer predictable monthly credits?{" "}
              <Link
                href="/subscription"
                className="font-medium text-violet-300/95 underline-offset-4 transition hover:text-violet-200 hover:underline"
              >
                View subscriptions
              </Link>
              .
            </p>

            <p className="mt-4 text-xs text-white/35">
              Current plan: <span className="text-white/55">{planDisplayName}</span>
            </p>
          </header>

          <section>
            <div className="mb-6 flex flex-col items-center gap-2 text-center sm:mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                  Credit packs
                </span>
              </div>
              <p className="max-w-md text-sm text-white/45">Larger packs include a better price per credit.</p>
            </div>

            <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 px-3 pt-6 pb-1 sm:px-6 sm:pt-7 md:grid-cols-6 md:gap-5 lg:px-8">
              {creditPacks.map((p, packIndex) => {
                const featured = p.key === "most-popular";
                const value = p.badge === "Best value";
                const savePercentMatch = /^Save\s+(\d+)%$/i.exec(p.promoLine);
                const savePercent = savePercentMatch?.[1] ?? null;
                const topRow = packIndex < 3;

                return (
                  <div
                    key={p.key}
                    className={cn(
                      "relative flex min-w-0 w-full flex-col rounded-2xl border p-6 transition-all duration-300",
                      topRow ? "md:col-span-2" : "md:col-span-3",
                      featured || value
                        ? "border-violet-400/35 bg-gradient-to-b from-violet-600/[0.14] via-[#0a0a10] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.12),0_8px_0_0_rgba(76,29,149,0.35)]"
                        : "border-white/10 bg-white/[0.03] shadow-[0_0_24px_rgba(0,0,0,0.35)] hover:border-violet-500/25 hover:bg-white/[0.05]",
                    )}
                  >
                    {savePercent ? (
                      <div
                        className="pointer-events-none z-[4] mb-2 inline-flex items-baseline gap-1 self-start rounded-full border border-emerald-400/25 bg-emerald-950/50 px-2.5 py-1 shadow-[0_4px_20px_rgba(16,185,129,0.18),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl"
                        aria-label={p.promoLine}
                      >
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-200/75">
                          Save
                        </span>
                        <span className="text-sm font-bold tabular-nums leading-none text-emerald-50 sm:text-base">
                          {savePercent}%
                        </span>
                      </div>
                    ) : null}
                    {p.badge ? (
                      <span
                        className={cn(
                          "absolute -top-2.5 left-1/2 max-w-[90%] -translate-x-1/2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                          featured
                            ? "border-violet-400/40 bg-violet-500/25 text-violet-100"
                            : "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
                        )}
                      >
                        {p.badge}
                      </span>
                    ) : null}

                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <h2 className="text-lg font-bold text-white">{p.name}</h2>
                      <span className="text-2xl font-extrabold tabular-nums text-violet-100 sm:text-3xl">{p.price}</span>
                    </div>

                    <p className="mt-3 min-h-[2.75rem] text-sm leading-relaxed text-white/50">{p.description}</p>

                    <div className="mt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">You get</p>
                      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-white">
                        {p.credits.toLocaleString()}
                        <span className="ml-1.5 text-base font-semibold text-white/40">credits</span>
                      </p>
                      {savePercent ? (
                        <p className="mt-2 text-xs font-medium text-white/35">Better price per credit</p>
                      ) : (
                        <p
                          className={cn(
                            "mt-2 text-xs font-semibold",
                            p.promoLine === "Entry pack" ? "text-white/40" : "text-violet-300/85",
                          )}
                        >
                          {p.promoLine}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      disabled={Boolean(checkoutLoading)}
                      onClick={() => void buyPack(p.key)}
                      className={cn(
                        "mt-6 h-12 w-full rounded-xl text-sm font-bold transition-all",
                        featured || value
                          ? "border border-violet-200/30 bg-violet-400 text-black shadow-[0_6px_0_0_rgba(76,29,149,0.85)] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)]"
                          : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === p.key ? (
                        <span className="inline-flex items-center gap-2">Redirecting…</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          Buy pack
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="pb-4 text-center text-[11px] text-white/30">
            Secure checkout with Stripe. Credits are applied when payment succeeds.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
