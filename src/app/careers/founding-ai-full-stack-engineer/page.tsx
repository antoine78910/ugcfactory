import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { FoundingEngineerApplicationForm } from "../_components/FoundingEngineerApplicationForm";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founding AI Full-Stack Engineer — Youry",
  description:
    "Ship full-stack features across our AI UGC platform: studio, workflows, generation, and the product layer that helps ecommerce, SaaS, and app teams market faster.",
  openGraph: {
    title: "Founding AI Full-Stack Engineer — Youry",
    description:
      "Join a small team building the infrastructure for performance-ready AI UGC.",
  },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-5 first:pt-0 last:border-b-0">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground sm:text-base">
      {items.map((item) => (
        <li key={item}>
          <p className="min-h-[1.5em]">{item}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function FoundingAiFullStackEngineerPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initialTab = sp.tab === "application" ? "application" : "overview";

  const overview = (
    <div className="space-y-2 text-sm leading-relaxed text-foreground sm:text-base">
      <p className="min-h-[1.5em]">
        We are building{" "}
        <a
          href="https://youry.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          Youry
        </a>
        , AI-powered UGC for teams who live in performance marketing — ecommerce
        brands, SaaS companies, and apps that need to ship ad-ready video fast
        without a traditional production crew.
      </p>
      <p className="min-h-[1.5em]">
        We are looking for a Founding AI Full-Stack Engineer to join early and
        build at high velocity with real ownership across product and infra.
      </p>

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What you will do
      </h3>
      <List
        items={[
          "Ship every single day.",
          "Build full-stack features end-to-end (frontend, backend, AI and media pipelines).",
          "Work deeply with LLMs, tool-use, and AI-native UX — without leaving polish behind.",
          "Turn messy marketer workflows into clear, trustworthy product surfaces.",
          "Harden systems that move real customer assets: generations, projects, billing edges.",
          "Fix bugs fast — and learn from them.",
          "Work directly with founders and users — minimal hierarchy.",
          "Help define engineering culture and standards from the start.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Stack
      </h3>
      <List
        items={[
          "Next.js (App Router) & TypeScript",
          "React Server / client boundaries — ship what fits the problem",
          "Supabase (auth, Postgres, storage) where it matters",
          "LLMs and structured outputs — reliability, evals, guardrails",
          "Vercel AI SDK and adjacent tooling where it speeds delivery",
          "Cursor, Claude, or whatever makes you fastest — shipped wins",
          "Speed over perfection; clarity over cleverness",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        You are
      </h3>
      <List
        items={[
          "An end-to-end builder (frontend + backend + AI integrations).",
          "Someone who ships often and does not wait for perfect specs.",
          "Deep into modern GenAI — you already use AI tools to design and implement.",
          "Comfortable with ambiguity, fast feedback loops, and direct user contact.",
          "Product-minded — you think in outcomes and learning, not ticket counts.",
          "Builder over employee mindset.",
          "Speed over comfort when the tradeoff is honest.",
          "Impact over title.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Hard requirements
      </h3>
      <List
        items={[
          "You use AI development tools daily (Cursor, Claude Code, Copilot, or equivalent).",
          "You believe GenAI is materially changing how products are built — and you act on it.",
          "You can ship full-stack apps in TypeScript and Next.js.",
          "You have shipped work that touches LLMs or multi-step AI workflows.",
          "You can work primarily remote with strong overlap on EU-friendly hours.",
          "You can show real work: GitHub, side projects, or production systems you owned.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Big add-ons (nice to have)
      </h3>
      <List
        items={[
          "Public writing or demos of what you build.",
          "Experience with creative tooling, video pipelines, or asset workflows.",
          "Background in growth, ads, or marketing tech.",
          "You have shipped your own product or substantial OSS.",
          "Previous early-stage startup experience.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What we offer
      </h3>
      <List
        items={[
          "Competitive cash compensation for stage and role.",
          "Meaningful equity — early team, real ownership.",
          "High learning ceiling alongside a focused product surface area.",
          "Small team, direct access to decisions that move the roadmap.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What this is not
      </h3>
      <List
        items={[
          "Not a slow corporate roadmap with six layers of approval.",
          "Not a role where “someone else” owns the AI pieces.",
          "Not for people who need exhaustive specs before writing code.",
          "Not for people who treat AI like a passing fad.",
          "Not for people who rarely ship.",
        ]}
      />

      <p className="mt-10 min-h-[1.5em] font-medium">
        Show us your repos. Show us what you have built. Show us what is live
        today.
      </p>
      <p className="min-h-[1.5em] text-muted-foreground">
        No fancy degree required. We care about work we can verify — not
        credentials on paper.
      </p>

      <div className="pt-8">
        <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
          <Link href="/careers/founding-ai-full-stack-engineer?tab=application">
            Apply for this job
          </Link>
        </Button>
      </div>
    </div>
  );

  const application = (
    <FoundingEngineerApplicationForm
      jobSlug="founding-ai-full-stack-engineer"
      headingClassName={instrumentSerif.className}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <JobPostingViewTracker jobSlug="founding-ai-full-stack-engineer" />
      <nav
        className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md"
        aria-label="Job posting navigation"
      >
        <ul className="mx-auto flex max-w-6xl list-none items-center gap-1 px-4 py-3 sm:gap-3 sm:px-6">
          <li>
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={174}
                height={52}
                className="h-7 w-auto opacity-90 sm:h-8"
                priority
              />
            </Link>
          </li>
          <li>
            <Link
              href="/careers"
              aria-label="Back to Youry's job listings"
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-5 -translate-x-px" aria-hidden />
            </Link>
          </li>
        </ul>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
        <h1
          className={`mb-10 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl ${instrumentSerif.className}`}
        >
          Founding AI Full-Stack Engineer
        </h1>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-1">
              <Section title="Location">Remote · EU-friendly hours</Section>
              <Section title="Employment type">Full time</Section>
              <Section title="Location type">Remote-first</Section>
              <Section title="Department">Youry — Engineering</Section>
            </div>
          </aside>

          <div className="min-w-0">
            <JobPostingTabs
              initialTab={initialTab}
              jobSlug="founding-ai-full-stack-engineer"
              overview={overview}
              application={application}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Youry.{" "}
            <Link href="/careers" className="underline underline-offset-4 hover:text-foreground">
              All openings
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
