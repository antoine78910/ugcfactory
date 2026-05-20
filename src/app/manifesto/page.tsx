import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { ArrowLeft, Asterisk } from "lucide-react";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Manifesto — Youry",
  description:
    "Why we believe anyone can ship high-performing AI UGC — for ecommerce, SaaS, and apps — without a traditional production team.",
  openGraph: {
    title: "Build Different — Youry Manifesto",
    description:
      "A letter to marketers and founders turning products into scroll-stopping UGC.",
  },
};

/** Hero image: `public/careers/hero.png` (same asset as the careers page). */
const MANIFESTO_HERO_SRC = "/careers/hero.png";

export default function ManifestoPage() {
  return (
    <article
      className={`min-h-screen bg-background text-foreground ${instrumentSerif.className}`}
    >
      <header className="mx-auto max-w-4xl px-6 pt-8 sm:px-10">
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span>Back</span>
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-6 pb-24 sm:px-10 sm:pb-32">
        <div
          className="mt-8 mb-3 flex justify-center text-muted-foreground/70"
          aria-hidden="true"
        >
          <Asterisk className="size-12" strokeWidth={1.25} />
        </div>

        <h1 className="text-center text-5xl font-normal leading-tight tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Build Different.
        </h1>
        <p className="mt-3 text-center font-sans text-lg italic text-muted-foreground sm:text-xl">
          a letter to the teams shipping UGC without waiting on production
        </p>
        <p className="mt-3 text-center font-sans text-sm text-muted-foreground/80">
          From Antoine, Marcus, Elena, and Jordan. 20 May 2026.
        </p>

        <div className="my-12 flex justify-center">
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl shadow-sm aspect-[5/4]">
            <Image
              src={MANIFESTO_HERO_SRC}
              alt="Founders at work: retro studio with CRT glow and YOURY on screen"
              width={1400}
              height={1120}
              className="h-auto w-full object-cover"
              sizes="(max-width: 640px) 100vw, 576px"
              priority
            />
          </div>
        </div>

        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            For decades, credible performance marketing meant crews: producers,
            editors, talent agents, studios, and calendars that rarely moved as fast
            as your tests. Paid social does not wait — but traditional UGC often
            does.
          </p>
          <p className="italic">That bottleneck is breaking.</p>
          <p>
            We are past the point where AI only “helps a little.” It can draft,
            iterate, and render the creative layer while you focus on the only
            things humans must own: the product truth, the offer, and what you are
            willing to prove in market.
          </p>
          <p>
            For ecommerce brands, SaaS teams, and app makers, the unlock is the
            same: ship more authentic-feeling UGC, learn faster from real
            performance data, and stop treating video like a quarterly project.
          </p>
        </div>

        <h2 className="mb-8 mt-20 text-center text-3xl font-normal italic text-foreground sm:text-4xl">
          I. The end of “we need a shoot”
        </h2>
        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            This is not about replacing taste. It is about removing the friction
            between a hypothesis and a creative on the wall. When production
            latency drops, marketing becomes experimentation again — not theater.
          </p>
          <p>
            The question stops being “can we get this filmed?” and becomes “what do we
            want to learn this week?”.
          </p>
          <p className="italic">Fewer gates. Faster loops. Clearer accountability.</p>
        </div>

        <h2 className="mb-8 mt-20 text-center text-3xl font-normal italic text-foreground sm:text-4xl">
          II. The lean growth team era
        </h2>
        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            The best brands on the feed are not always the biggest — they are the
            ones that publish, measure, and refine with discipline. The constraint
            used to be headcount. Now the constraint is clarity: what angle, what
            proof, what CTA, what format, what hook.
          </p>
          <p>
            When one operator can explore dozens of UGC variants without booking a
            studio, leverage shifts toward execution quality — not org-chart size.
          </p>
        </div>

        <h2 className="mb-8 mt-20 text-center text-3xl font-normal italic text-foreground sm:text-4xl">
          III. Care is the new moat
        </h2>
        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            When everyone can generate, volume is cheap — and noise is expensive.
            The winners still sweat the details: the claim you can defend, the
            story that matches the product, the offer that respects the customer.
          </p>
          <p>
            AI scales output. Humans still choose what deserves to exist — and what
            should never be said about the brand.
          </p>
          <p className="italic">Care compounds. Sloppy sameness does not.</p>
        </div>

        <h2 className="mb-8 mt-20 text-center text-3xl font-normal italic text-foreground sm:text-4xl">
          IV. Abundant creation, responsible shipping
        </h2>
        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            We believe in more people building — not fewer. More merchants testing
            hooks. More SaaS teams explaining complex products in human language.
            More apps finding language-market fit before they burn budget.
          </p>
          <p>
            Youry exists so “publish UGC” is not a special-occasion event. It is a
            weekly habit — fast enough for performance marketing, grounded enough
            for brand teams.
          </p>
          <p className="italic">Technology should multiply builders — not bury them in complexity.</p>
        </div>

        <h2 className="mb-8 mt-20 text-center text-3xl font-normal italic text-foreground sm:text-4xl">
          V. The manifesto
        </h2>
        <div className="space-y-6 text-center text-base leading-relaxed sm:text-lg">
          <p>
            The future still needs better tools: workflows that respect brand
            rules, iteration that stays traceable, and outputs that slot cleanly
            into how teams already test. Someone has to build that layer with
            seriousness.
          </p>
          <p className="italic">That is what we are doing at Youry.</p>
          <p>
            Build Different is for teams who would rather ship a new angle tonight
            than wait for permission tomorrow — for ecommerce, SaaS, apps, and
            anyone who believes performance creative should be approachable, not
            gated.
          </p>
        </div>

        <div
          className="mb-8 mt-20 flex justify-center text-muted-foreground/70"
          aria-hidden="true"
        >
          <Asterisk className="size-7" strokeWidth={1.25} />
        </div>

        <p className="text-center text-sm italic leading-relaxed text-muted-foreground">
          Build Different is a manifesto from the team at Youry.
          <br />
          It belongs to everyone who cares — and ships.
        </p>
        <p className="mt-6 text-center font-sans text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} Youry.
        </p>
      </div>
    </article>
  );
}
