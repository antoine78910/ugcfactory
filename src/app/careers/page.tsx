import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { CareersLandingTracker } from "./_components/CareersLandingTracker";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Careers — Youry",
  description:
    "Help us build AI UGC for ecommerce, SaaS, and apps — ship product, design, and growth systems that empower every team to market faster.",
  openGraph: {
    title: "Join Us — Youry",
    description:
      "Build the future of performance creative with a small, ambitious team.",
  },
};

type JobOpening = {
  href: string;
  discipline: string;
  location: string;
  title: string;
  description: string;
};

/**
 * Replace with Ashby (or other) URLs when your board is live. Default is a
 * mailto so listings still work before ATS setup.
 */
const JOBS: JobOpening[] = [
  {
    href: "/careers/founding-ai-full-stack-engineer",
    discipline: "Engineering",
    location: "Remote · EU-friendly hours",
    title: "Founding AI Full-Stack Engineer",
    description:
      "Ship features daily across the stack. Work with LLMs and production pipelines so teams turn products into ad-ready UGC — studio workflows, generation, reliability, and the glue that makes it feel magic for ecommerce, SaaS, and app marketers.",
  },
  {
    href:
      "mailto:careers@youry.io?subject=Application%20%E2%80%94%20Founding%20Design%20Engineer",
    discipline: "Design",
    location: "Remote · EU-friendly hours",
    title: "Founding Design Engineer",
    description:
      "Design and ship interfaces that make complex creative workflows feel obvious. Own UX, UI, and code end-to-end — flows, IA, microcopy, motion, and a visual system that earns trust when budgets and brand reputation are on the line.",
  },
  {
    href: "/careers/founding-creative",
    discipline: "Creative",
    location: "Remote · EU-friendly hours",
    title: "Founding Creative (content & video)",
    description:
      "Own how Youry looks in motion — launch films, social-first cuts, and a visual language for an AI UGC brand. Shoot, edit, animate, and ship; AI-augmented, taste-first.",
  },
  {
    href:
      "mailto:careers@youry.io?subject=Application%20%E2%80%94%20AI%20Builder%20in%20Residence",
    discipline: "Residency",
    location: "Remote · EU-friendly hours",
    title: "AI Builder in Residence",
    description:
      "The best teams shape roles around people, not templates. If you obsess over details others miss and want to build something only you can articulate, apply — we will scope the work around your strengths and the problems worth solving next.",
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <CareersLandingTracker />
      <header className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span>Back</span>
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-12 pt-24 sm:px-6 md:pb-24 md:pt-32">
        <div className="mb-6 text-center sm:mb-12">
          <h1
            className={`mb-4 text-4xl font-bold text-foreground sm:text-5xl md:text-6xl ${instrumentSerif.className}`}
          >
            Join Us
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            We are building the infrastructure for teams who ship AI UGC at the
            speed of performance marketing — for ecommerce, SaaS, and apps that
            need to test creative without a traditional production crew.
          </p>
          <p className="text-sm text-muted-foreground/70">
            No degree required. No credentials asked. We only care about what
            you have built.
          </p>
        </div>

        <div className="mx-auto mb-10 max-w-4xl sm:mb-14">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-lg">
            <Image
              src="/careers/hero.png"
              alt="Founders at work in a retro studio: CRT glow, server lights, and the YOURY name on screen"
              fill
              className="object-cover object-center"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
            />
          </div>
        </div>

        <div className="space-y-4">
          {JOBS.map((job) => {
            const cardClassName =
              "group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-lg sm:flex-row sm:items-center sm:p-8";
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                      {job.discipline}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {job.location}
                    </span>
                  </div>
                  <h2
                    className={`mb-2 text-xl font-bold text-foreground sm:text-2xl ${instrumentSerif.className}`}
                  >
                    {job.title}
                  </h2>
                  <p className="text-sm text-muted-foreground sm:text-base">
                    {job.description}
                  </p>
                </div>
                <ArrowUpRight
                  className="size-5 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden="true"
                />
              </>
            );
            if (job.href.startsWith("/")) {
              return (
                <Link key={job.title} href={job.href} className={cardClassName}>
                  {inner}
                </Link>
              );
            }
            const isMailto = job.href.startsWith("mailto:");
            return (
              <a
                key={job.title}
                href={job.href}
                target={isMailto ? undefined : "_blank"}
                rel={isMailto ? undefined : "noopener noreferrer"}
                className={cardClassName}
              >
                {inner}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
