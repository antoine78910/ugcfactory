import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CareersJobMetaCard, CareersJobShell } from "../_components/CareersJobShell";
import { careersTheme } from "../_components/careersTheme";
import { FoundingEngineerApplicationForm } from "../_components/FoundingEngineerApplicationForm";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founding AI Full-Stack Engineer, Youry",
  description:
    "Ship full-stack features across our AI UGC platform: studio, workflows, generation, and the product layer that helps ecommerce, SaaS, and app teams market faster.",
  openGraph: {
    title: "Founding AI Full-Stack Engineer, Youry",
    description:
      "Join a small team building the infrastructure for performance-ready AI UGC.",
  },
};

export default async function FoundingAiFullStackEngineerPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initialTab = sp.tab === "application" ? "application" : "overview";

  const overview = (
    <div className="careers-job-prose">
      <p>
        We are building{" "}
        <a href="https://youry.io" target="_blank" rel="noopener noreferrer">
          Youry
        </a>
        , AI-powered UGC for teams who live in performance marketing, ecommerce
        brands, SaaS companies, and apps that need to ship ad-ready video fast
        without a traditional production crew.
      </p>
      <p>
        We are looking for a Founding AI Full-Stack Engineer to join early and
        build at high velocity with real ownership across product and infra.
      </p>

      <h3>What you will do</h3>
      <ul>
        {[
          "Ship every single day.",
          "Build full-stack features end-to-end (frontend, backend, AI and media pipelines).",
          "Work deeply with LLMs, tool-use, and AI-native UX, without leaving polish behind.",
          "Turn messy marketer workflows into clear, trustworthy product surfaces.",
          "Harden systems that move real customer assets: generations, projects, billing edges.",
          "Fix bugs fast, and learn from them.",
          "Work directly with founders and users, minimal hierarchy.",
          "Help define engineering culture and standards from the start.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Stack</h3>
      <ul>
        {[
          "Next.js (App Router) & TypeScript",
          "React Server / client boundaries, ship what fits the problem",
          "Supabase (auth, Postgres, storage) where it matters",
          "LLMs and structured outputs, reliability, evals, guardrails",
          "Vercel AI SDK and adjacent tooling where it speeds delivery",
          "Cursor, Claude, or whatever makes you fastest, shipped wins",
          "Speed over perfection; clarity over cleverness",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>You are</h3>
      <ul>
        {[
          "An end-to-end builder (frontend + backend + AI integrations).",
          "Someone who ships often and does not wait for perfect specs.",
          "Deep into modern GenAI, you already use AI tools to design and implement.",
          "Comfortable with ambiguity, fast feedback loops, and direct user contact.",
          "Product-minded, you think in outcomes and learning, not ticket counts.",
          "Builder over employee mindset.",
          "Speed over comfort when the tradeoff is honest.",
          "Impact over title.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Hard requirements</h3>
      <ul>
        {[
          "You use AI development tools daily (Cursor, Claude Code, Copilot, or equivalent).",
          "You believe GenAI is materially changing how products are built, and you act on it.",
          "You can ship full-stack apps in TypeScript and Next.js.",
          "You have shipped work that touches LLMs or multi-step AI workflows.",
          "You can work primarily remote with strong overlap on EU-friendly hours.",
          "You can show real work: GitHub, side projects, or production systems you owned.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Big add-ons (nice to have)</h3>
      <ul>
        {[
          "Public writing or demos of what you build.",
          "Experience with creative tooling, video pipelines, or asset workflows.",
          "Background in growth, ads, or marketing tech.",
          "You have shipped your own product or substantial OSS.",
          "Previous early-stage startup experience.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What we offer</h3>
      <ul>
        {[
          "Competitive cash compensation for stage and role.",
          "Meaningful equity, early team, real ownership.",
          "High learning ceiling alongside a focused product surface area.",
          "Small team, direct access to decisions that move the roadmap.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What this is not</h3>
      <ul>
        {[
          "Not a slow corporate roadmap with six layers of approval.",
          'Not a role where "someone else" owns the AI pieces.',
          "Not for people who need exhaustive specs before writing code.",
          "Not for people who treat AI like a passing fad.",
          "Not for people who rarely ship.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <p className="careers-job-prose--emphasis">
        Show us your repos. Show us what you have built. Show us what is live
        today.
      </p>
      <p className="careers-job-prose--muted">
        No fancy degree required. We care about work we can verify, not
        credentials on paper.
      </p>

      <div className="pt-8">
        <Button asChild size="lg" className={careersTheme.btnPrimary}>
          <Link href="/careers/founding-ai-full-stack-engineer?tab=application">
            Apply for this job
          </Link>
        </Button>
      </div>
    </div>
  );

  const application = (
    <FoundingEngineerApplicationForm jobSlug="founding-ai-full-stack-engineer" />
  );

  return (
    <>
      <JobPostingViewTracker jobSlug="founding-ai-full-stack-engineer" />
      <CareersJobShell title="Founding AI Full-Stack Engineer">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CareersJobMetaCard
              items={[
                { title: "Location", value: "Remote · EU-friendly hours" },
                { title: "Employment type", value: "Full time" },
                { title: "Location type", value: "Remote-first" },
                { title: "Department", value: "Youry, Engineering" },
              ]}
            />
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
      </CareersJobShell>
    </>
  );
}
