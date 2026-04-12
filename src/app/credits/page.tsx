"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import { toast } from "sonner";
import StudioShell from "@/app/_components/StudioShell";
import { consumeCheckoutQueryParams } from "@/app/_components/CreditsPlanContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  upToEstimateAiImagesFromCredits,
  upToEstimateAiVideosFromCredits,
} from "@/lib/billing/creditUsageEstimates";
import { CREDIT_PACKS } from "@/lib/pricing";
import type { StripeDisplayPricesPayload } from "@/lib/billing/stripeDisplayTypes";
import { formatMoneyAmount } from "@/lib/billing/formatMoney";
import { buildUsdStripeDisplayPricesFallback } from "@/lib/billing/stripeDisplayFallback";

function defaultPackPriceUsd(priceUsd: number): string {
  return formatMoneyAmount(priceUsd, "usd");
}

type CreditPack = {
  key: string;
  price: string;
  priceUsd: number;
  name: string;
  credits: number;
  description: string;
  promoLine: string;
  badge?: string;
};

const PACK_UI: Omit<CreditPack, "price" | "credits" | "priceUsd">[] = [
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

const defaultCreditPacks: CreditPack[] = PACK_UI.map((meta, i) => {
  const row = CREDIT_PACKS[i];
  if (!row) throw new Error(`CREDIT_PACKS[${i}] missing`);
  return {
    ...meta,
    price: defaultPackPriceUsd(row.price_usd),
    priceUsd: row.price_usd,
    credits: row.credits,
  };
});

function CreditPackPriceSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-12 w-[min(100%,12rem)] animate-pulse rounded-lg bg-violet-500/20 md:h-14" />
      <div className="h-7 w-[min(100%,9rem)] animate-pulse rounded-lg bg-white/12" />
      <div className="h-3 w-48 max-w-full animate-pulse rounded bg-white/10" />
    </div>
  );
}

function PackCardDescription({ text }: { text: string }) {
  return <p className="mt-1 min-h-0 text-sm leading-snug text-white/48">{text}</p>;
}

export default function CreditsPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [displayPrices, setDisplayPrices] = useState<StripeDisplayPricesPayload | null>(null);

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

  const billingPricesReady = displayPrices !== null;

  const creditPacks: CreditPack[] = useMemo(() => {
    if (!displayPrices) return defaultCreditPacks;
    const cur = displayPrices.currency;
    return defaultCreditPacks.map((p) => {
      const sp = displayPrices.creditPacks[p.key as keyof StripeDisplayPricesPayload["creditPacks"]];
      if (sp) return { ...p, price: sp.formatted, priceUsd: sp.amount };
      return { ...p, price: formatMoneyAmount(p.priceUsd, cur) };
    });
  }, [displayPrices]);

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
      <div className="relative min-w-0 overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[960px] -translate-x-1/2 rounded-full bg-violet-600/14 blur-[130px]" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-indigo-600/10 blur-[90px]" />

        <div className="relative mx-auto max-w-6xl space-y-14 px-5 py-10 md:px-8 md:py-12">
          <header className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">Credits</p>
            <h1 className="mt-3 bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl md:text-[2.75rem] md:leading-[1.08]">
              Top up and keep creating
            </h1>
            <p className="mt-4 text-xs text-white/38">
              One-off packs work with any plan. Prefer monthly credits?{" "}
              <Link
                href="/subscription"
                className="font-medium text-violet-300/95 underline-offset-4 transition hover:text-violet-200 hover:underline"
              >
                Subscriptions
              </Link>
            </p>
          </header>

          <section>
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 pt-2 sm:px-0 md:grid-cols-6 md:gap-5">
              {creditPacks.map((p, packIndex) => {
                const featured = p.key === "most-popular";
                const value = p.badge === "Best value";
                const savePercentMatch = /^Save\s+(\d+)%$/i.exec(p.promoLine);
                const savePercent = savePercentMatch?.[1] ?? null;
                const topRow = packIndex < 3;

                const oldPrice = savePercent ? Math.round(p.priceUsd / (1 - Number(savePercent) / 100)) : null;
                const maxImages = upToEstimateAiImagesFromCredits(p.credits);
                const maxVideos = upToEstimateAiVideosFromCredits(p.credits);
                const showSavePill = Boolean(savePercent) && !p.badge;
                const showPromoPill = !p.badge && !showSavePill && p.promoLine.length > 0;

                return (
                  <div
                    key={p.key}
                    className={cn(
                      "relative flex h-full min-h-0 min-w-0 w-full flex-col rounded-2xl border p-6 transition-all duration-300",
                      topRow ? "md:col-span-2" : "md:col-span-3",
                      featured || value
                        ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.18] via-[#0b0914] to-[#06070d] shadow-[0_0_48px_rgba(139,92,246,0.14),0_8px_0_0_rgba(76,29,149,0.4)]"
                        : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    <div className="mb-2 flex min-h-[2.25rem] flex-wrap items-start gap-1.5">
                      {p.badge ? (
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            featured
                              ? "border-violet-400/45 bg-violet-500/25 text-violet-100"
                              : "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
                          )}
                        >
                          {p.badge}
                        </span>
                      ) : null}
                      {showSavePill ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                          Save {savePercent}%
                        </span>
                      ) : null}
                      {showPromoPill ? (
                        <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
                          {p.promoLine}
                        </span>
                      ) : null}
                    </div>

                    <div className="min-h-0">
                      <h2 className="text-xl font-bold leading-tight text-white">{p.name}</h2>
                      <PackCardDescription text={p.description} />
                    </div>

                    <div className="mt-3 min-h-0">
                      {billingPricesReady ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/25 text-violet-200 md:h-11 md:w-11">
                              <Coins className="h-5 w-5 md:h-[1.35rem] md:w-[1.35rem]" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/80">
                                Credits
                              </p>
                              <p className="text-3xl font-extrabold tabular-nums leading-[1.1] tracking-tight text-white md:text-4xl">
                                {p.credits.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 border-t border-white/[0.08] pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                              Price
                            </p>
                            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0">
                              <span className="text-xl font-bold tabular-nums leading-none text-white/90 md:text-2xl">
                                {p.price}
                              </span>
                              {displayPrices && oldPrice != null && oldPrice > p.priceUsd ? (
                                <span className="text-sm font-medium line-through text-white/30">
                                  {formatMoneyAmount(oldPrice, displayPrices.currency)}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] leading-tight text-white/35">One-time purchase</p>
                          </div>
                        </>
                      ) : (
                        <CreditPackPriceSkeleton />
                      )}
                    </div>

                    <Button
                      type="button"
                      disabled={Boolean(checkoutLoading)}
                      onClick={() => void buyPack(p.key)}
                      className={cn(
                        "mt-3 h-11 w-full shrink-0 rounded-xl text-sm font-bold transition-all",
                        featured || value
                          ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
                          : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === p.key ? (
                        <span className="inline-flex items-center gap-2">Redirecting…</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          Buy now
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </Button>

                    <ul className="mt-4 flex min-h-0 flex-1 flex-col space-y-2 border-t border-white/10 pt-4 text-left text-xs text-white/72">
                      <li className="text-white/55">
                        Up to {maxImages.toLocaleString()} AI images (Nanobanana)
                      </li>
                      <li className="text-white/55">
                        Up to {maxVideos.toLocaleString()} AI videos (Sora 2)
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="pb-4 text-center text-[11px] text-white/28">
            Secure checkout with Stripe. Credits are applied when payment succeeds.
            <br />
            Pack credits expire 3 months after purchase if unused.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
