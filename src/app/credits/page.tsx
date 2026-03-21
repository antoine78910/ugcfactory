"use client";

import Link from "next/link";
import StudioShell from "@/app/_components/StudioShell";
import { CREDIT_PACKS } from "@/lib/pricing";

type CreditPack = {
  key: string;
  price: string;
  name: string;
  credits: number;
  description: string;
  promoLine: string;
  badge?: string;
  ctaHref: string;
};

const PACK_UI: Omit<CreditPack, "price" | "credits">[] = [
  {
    key: "starter",
    name: "Starter",
    description: "👉 Perfect to test & launch your first ads",
    promoLine: "(no discount)",
    ctaHref: "/auth?pack=starter",
  },
  {
    key: "growth",
    name: "Growth",
    description: "👉 For consistent content & scaling",
    promoLine: "Save 11%",
    ctaHref: "/auth?pack=growth",
  },
  {
    key: "most-popular",
    name: "Most Popular ⭐",
    description: "👉 Best balance for serious creators",
    badge: "BEST BALANCE",
    promoLine: "🔥 Save 20%",
    ctaHref: "/auth?pack=most-popular",
  },
  {
    key: "pro",
    name: "Pro",
    description: "👉 For heavy users & brands",
    promoLine: "🚀 Save 27%",
    ctaHref: "/auth?pack=pro",
  },
  {
    key: "scale",
    name: "Scale",
    description: "👉 For teams & aggressive scaling",
    badge: "BEST VALUE",
    promoLine: "💎 Save 36%",
    ctaHref: "/auth?pack=scale",
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
  return (
    <StudioShell>
      <section className="max-w-6xl space-y-8 px-6 py-6 md:px-8">
        <header className="border-b border-white/10 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
          <p className="mt-1 text-sm text-white/55">
            Buy credit packs to run generations. Need a recurring plan? See{" "}
            <Link href="/subscription" className="font-medium text-violet-300 underline-offset-2 hover:underline">
              Subscription
            </Link>
            .
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creditPacks.map((p) => {
            const isFeatured = p.badge === "BEST VALUE" || p.key === "most-popular";

            return (
              <div
                key={p.key}
                className={[
                  "relative overflow-hidden rounded-2xl border p-5 transition-all",
                  p.key === "pro" || p.key === "scale" ? "sm:col-span-2 lg:col-span-3" : "",
                  isFeatured
                    ? "border-violet-500/30 bg-gradient-to-br from-violet-500/18 to-transparent shadow-[0_0_0_1px_rgba(139,92,246,0.18)] hover:shadow-[0_0_60px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:border-violet-500/25 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {p.badge ? (
                  <div
                    className={[
                      "absolute right-4 top-4 rounded-md border px-2 py-1 text-[11px] font-bold tracking-wide",
                      p.badge === "BEST VALUE"
                        ? "border-violet-400/30 bg-violet-500/20 text-violet-200"
                        : "border-violet-200/30 bg-violet-400/20 text-violet-200",
                    ].join(" ")}
                  >
                    {p.badge}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="text-sm font-bold uppercase tracking-wide text-violet-300">
                    💳 {p.price} — {p.name}
                  </div>

                  <div className="text-4xl font-extrabold leading-none">{p.credits.toLocaleString()} credits</div>

                  <div
                    className={[
                      "text-sm font-semibold",
                      p.promoLine.startsWith("(no discount)") ? "text-white/55" : "text-violet-200/95",
                    ].join(" ")}
                  >
                    {p.promoLine}
                  </div>
                </div>

                <p className="mt-3 text-sm font-semibold text-white/75">{p.description}</p>

                <div className="mt-6">
                  <Link
                    href={p.ctaHref}
                    className={[
                      "flex h-11 w-full items-center justify-center rounded-xl border font-semibold transition-all",
                      isFeatured
                        ? "border-violet-200/30 bg-violet-400 text-black hover:bg-violet-300"
                        : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                    ].join(" ")}
                  >
                    Buy now
                  </Link>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-sm font-semibold text-white/80">🧠 Petit hack conversion</div>
          <div className="mt-1 text-sm text-white/60">👉 Tu peux même booster :</div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-violet-200">Boost</div>
              <div className="mt-2 text-lg font-extrabold">
                $120 <span className="text-white/60">→</span> Best value for most users
              </div>
            </div>
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-violet-200">Boost</div>
              <div className="mt-2 text-lg font-extrabold">
                $480 <span className="text-white/60">→</span> Max savings
              </div>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-white/40">
          Demo UI. Connect packs & checkout to your payment provider when ready.
        </footer>
      </section>
    </StudioShell>
  );
}
