import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { CareersLandingTracker } from "./_components/CareersLandingTracker";
import { CareersPageHeader } from "./_components/CareersPageHeader";
import { marketingPageRootClassName } from "@/lib/youryFonts";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Founders hero, YOURY on CRT (`public/careers/hero.png`). Bump `v` after replacing the file. */
const CAREERS_HERO_SRC = "/careers/hero.png";

export const metadata: Metadata = {
  title: "Careers, Youry",
  description:
    "Help us build AI UGC for ecommerce, SaaS, and apps, ship product, design, and growth systems that empower every team to market faster.",
  openGraph: {
    title: "Join Us, Youry",
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
 * In-app listings link to job pages under `/careers/...`.
 */
const JOBS: JobOpening[] = [
  {
    href: "/careers/founding-ai-full-stack-engineer",
    discipline: "Engineering",
    location: "Remote · EU-friendly hours",
    title: "Founding AI Full-Stack Engineer",
    description:
      "Ship features daily across the stack. Work with LLMs and production pipelines so teams turn products into ad-ready UGC, studio workflows, generation, reliability, and the glue that makes it feel magic for ecommerce, SaaS, and app marketers.",
  },
  {
    href: "/careers/founding-creative",
    discipline: "Creative",
    location: "Remote · EU-friendly hours",
    title: "Founding Creative (content & video)",
    description:
      "Own how Youry looks in motion, launch films, social-first cuts, and a visual language for an AI UGC brand. Shoot, edit, animate, and ship; AI-augmented, taste-first.",
  },
  {
    href: "/careers/smart-video-editor",
    discipline: "Creative",
    location: "Remote · worldwide",
    title: "Smart Short Form Video Editor",
    description:
      "Smart short form editor for youry.io, performance $500/500k views (min $1, max $500/video), unlimited volume, 3+ edits/day. @buildyourstoreai, @pinecode.ai.",
  },
];

export default function CareersPage() {
  return (
    <div className={marketingPageRootClassName}>
      <CareersLandingTracker />
      <CareersPageHeader />

      <div className="mx-auto max-w-5xl px-4 pb-12 pt-16 sm:px-6 md:pb-24 md:pt-24">
        <div className="mb-6 text-center sm:mb-12">
          <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
            Join us
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-lg text-white/60 sm:text-xl">
            We are building the infrastructure for teams who ship AI UGC at the
            speed of performance marketing, for ecommerce, SaaS, and apps that
            need to test creative without a traditional production crew.
          </p>
          <p className="text-sm text-white/45">
            No degree required. No credentials asked. We only care about what
            you have built.
          </p>
        </div>

        <div className="mx-auto mb-10 max-w-4xl sm:mb-14">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <Image
              src={CAREERS_HERO_SRC}
              alt="Founders at work in a retro studio: CRT glow, server lights, and YOURY on screen"
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
              "group flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-sm transition-all duration-300 hover:border-violet-500/35 hover:bg-white/[0.06] hover:shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)] sm:flex-row sm:items-center sm:p-8";
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full border border-violet-400/35 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200">
                      {job.discipline}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-white/45">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {job.location}
                    </span>
                  </div>
                  <h2 className="mb-2 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
                    {job.title}
                  </h2>
                  <p className="text-sm text-white/55 sm:text-base">
                    {job.description}
                  </p>
                </div>
                <ArrowUpRight
                  className="size-5 shrink-0 text-white/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-violet-300"
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

        <p className="mt-12 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Youry ·{" "}
          <Link
            href="/manifesto"
            className="text-violet-300/90 underline underline-offset-4 hover:text-violet-200"
          >
            Manifesto
          </Link>
        </p>
      </div>
    </div>
  );
}
