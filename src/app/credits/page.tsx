import Link from "next/link";
import { Check } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed left-1/2 top-0 -z-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Pick your credit pack</h1>
            <p className="max-w-2xl text-sm text-white/60">Get access to more generations and priority access to new features</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creditPacks.map((p, idx) => {
            const isFeatured = p.badge === "BEST VALUE" || p.key === "most-popular";

            return (
              <div
                key={p.key}
                className={[
                  "relative overflow-hidden rounded-2xl border p-5 transition-all",
                  isFeatured
                    ? "border-violet-500/30 bg-gradient-to-br from-violet-500/18 to-transparent shadow-[0_0_0_1px_rgba(139,92,246,0.18)] hover:shadow-[0_0_60px_rgba(139,92,246,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:border-violet-500/25 hover:bg-white/[0.04]",
                  // Mimic the screenshot layout: 3 cards on top, 2 below.
                  idx === 3 ? "lg:col-span-1 sm:col-span-1" : "",
                ].join(" ")}
              >
                {p.badge ? (
                  <div className="absolute right-4 top-4 rounded-md bg-rose-500/20 px-2 py-1 text-[11px] font-bold tracking-wide text-rose-200 border border-rose-400/30">
                    {p.badge}
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-extrabold leading-none">{p.price}</div>
                    <div className="mt-1 text-sm text-white/70">{p.title}</div>
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
                      p.key === "growth" || p.key === "most-popular"
                        ? "border-violet-200/30 bg-violet-400 text-black hover:bg-violet-300"
                        : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                    ].join(" ")}
                  >
                    Buy Now
                  </Link>
                </div>
              </div>
            );
          })}
        </section>

        <footer className="mt-8 text-center text-xs text-white/40">
          Demo checkout buttons. Connect them to your payment provider when ready.
        </footer>
      </main>
    </div>
  );
}

