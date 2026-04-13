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
    <div className="space-y-2" aria-hidden>
      <div className="h-10 w-[min(100%,11rem)] animate-pulse rounded-lg bg-violet-500/20 md:h-11" />
      <div className="h-6 w-[min(100%,8rem)] animate-pulse rounded-lg bg-white/12" />
      <div className="h-2.5 w-40 max-w-full animate-pulse rounded bg-white/10" />
    </div>
  );
}

function PackCardDescription({ text }: { text: string }) {
  return <p className="mt-0.5 min-h-0 text-xs leading-snug text-white/48">{text}</p>;
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

        <div className="relative mx-auto max-w-6xl space-y-8 px-5 py-7 md:px-8 md:py-9">
          <header className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400/90">Credits</p>
            <h1 className="mt-2 bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl md:text-[2.25rem] md:leading-[1.1]">
              Top up and keep creating
            </h1>
            <p className="mt-2.5 text-[11px] text-white/38">
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
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3.5 sm:px-0 md:grid-cols-6 md:gap-4">
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
                      "relative flex h-full min-h-0 min-w-0 w-full flex-col rounded-xl border p-4 transition-all duration-300 md:p-5",
                      topRow ? "md:col-span-2" : "md:col-span-3",
                      featured || value
                        ? "border-violet-400/40 bg-gradient-to-b from-violet-600/[0.18] via-[#0b0914] to-[#06070d] shadow-[0_0_32px_rgba(139,92,246,0.12),0_5px_0_0_rgba(76,29,149,0.45)]"
                        : "border-white/10 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.045]",
                    )}
                  >
                    <div className="mb-1.5 flex min-h-0 flex-wrap items-start gap-1">
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
                      <h2 className="text-lg font-bold leading-tight text-white">{p.name}</h2>
                      <PackCardDescription text={p.description} />
                    </div>

                    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                      <div className="flex min-h-0 flex-1 flex-col">
                        {billingPricesReady ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/25 text-violet-200">
                                <Coins className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                              </span>
                              <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-300/80">
                                  Credits
                                </p>
                                <p className="text-2xl font-extrabold tabular-nums leading-[1.1] tracking-tight text-white md:text-3xl">
                                  {p.credits.toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <ul className="mt-1.5 space-y-0.5 text-left text-[10px] leading-snug text-white/55">
                              <li>Up to {maxImages.toLocaleString()} AI images (Nanobanana)</li>
                              <li>Up to {maxVideos.toLocaleString()} AI videos (Sora 2)</li>
                            </ul>
                            <div className="mt-2.5 border-t border-white/[0.08] pt-2">
                              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/40">
                                Price
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                                <span className="text-lg font-bold tabular-nums leading-none text-white/90 md:text-xl">
                                  {p.price}
                                </span>
                                {displayPrices && oldPrice != null && oldPrice > p.priceUsd ? (
                                  <span className="text-xs font-medium line-through text-white/30">
                                    {formatMoneyAmount(oldPrice, displayPrices.currency)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-[10px] leading-tight text-white/35">One-time purchase</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <CreditPackPriceSkeleton />
                            <ul className="mt-2 space-y-0.5 text-left text-[10px] leading-snug text-white/55">
                              <li>Up to {maxImages.toLocaleString()} AI images (Nanobanana)</li>
                              <li>Up to {maxVideos.toLocaleString()} AI videos (Sora 2)</li>
                            </ul>
                          </>
                        )}
                      </div>

                      <Button
                        type="button"
                        disabled={Boolean(checkoutLoading)}
                        onClick={() => void buyPack(p.key)}
                        className={cn(
                          "h-9 w-full shrink-0 rounded-lg text-xs font-bold transition-all",
                        featured || value
                          ? "border border-violet-200/35 bg-violet-400 text-black shadow-[0_4px_0_0_rgba(76,29,149,0.9)] hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.9)]"
                          : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {checkoutLoading === p.key ? (
                        <span className="inline-flex items-center gap-2">Redirecting…</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          Buy now
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="pb-2 text-center text-[10px] text-white/28">
            Secure checkout with Stripe. Credits are applied when payment succeeds.
            <br />
            Pack credits expire 3 months after purchase if unused.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
