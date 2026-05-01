import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Clipping Tools",
  description: "Access clipping tools, templates, link-to-ad references and workflows.",
  robots: { index: false, follow: false },
};

type LinkToAdReference = {
  title: string;
  angle: string;
  steps: string[];
};

type WorkflowReference = {
  title: string;
  assets: string;
  notes: string;
};

const LINK_TO_AD_REFERENCES: LinkToAdReference[] = [
  {
    title: "Project copy · Fitness recovery cream",
    angle: "Pain-point > social proof > clear CTA",
    steps: [
      "Angle research and shortlist",
      "Hook variants benchmark",
      "Script framing and structure",
      "Shot list and delivery notes",
    ],
  },
  {
    title: "Project copy · Posture correction app",
    angle: "Before/after + objection handling",
    steps: [
      "Audience pains collected",
      "Winning hook deconstruction",
      "Step-by-step script mapping",
      "Filming guide and checkpoints",
    ],
  },
];

const WORKFLOW_REFERENCES: WorkflowReference[] = [
  {
    title: "Workflow template · Product explainer UGC",
    assets: "Images + videos downloadable",
    notes: "Reusable path from angle research to final filming checklist.",
  },
  {
    title: "Workflow template · Testimonial style ads",
    assets: "B-roll + references downloadable",
    notes: "Focus on trust sequence, pacing and claim proof order.",
  },
];

export default function ClippingPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] px-4 py-8 text-white sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80">
            Clipping
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Clipping tools</h1>
          <p className="max-w-3xl text-sm text-white/65">
            Access templates, read-only Link to Ad projects, and workflow copies to help clippers
            study each step before filming.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <p className="mb-2 inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">
              Template 1
            </p>
            <h2 className="text-base font-semibold text-white">
              One take · hook + split-screen template · auto export
            </h2>
            <p className="mt-2 text-sm text-white/65">
              Open Template 1 directly from clipping and launch studio recording from this flow.
            </p>
            <Link
              href="/clipping/template-1"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              Open Template 1
            </Link>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <p className="mb-2 inline-flex rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85">
              Studio
            </p>
            <h2 className="text-base font-semibold text-white">Studio corner (camera filming)</h2>
            <p className="mt-2 text-sm text-white/65">
              Dedicated area for recording with webcam using clipping templates.
            </p>
            <Link
              href="/clipping/studio"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Open studio
            </Link>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-base font-semibold text-white">Link to ad (read-only copies)</h2>
            <p className="mt-2 text-sm text-white/65">
              Explore selected projects step by step: angle research, hook analysis and production
              breakdown. No generation available here.
            </p>
            <div className="mt-4 space-y-3">
              {LINK_TO_AD_REFERENCES.map((reference) => (
                <div key={reference.title} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">{reference.title}</p>
                  <p className="mt-1 text-xs text-white/65">Angle: {reference.angle}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-white/55">
                    {reference.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-base font-semibold text-white">Workflow (templates + downloads)</h2>
            <p className="mt-2 text-sm text-white/65">
              Open workflow template copies and download supporting images/videos for production
              prep. Navigation is read-only for clippers.
            </p>
            <div className="mt-4 space-y-3">
              {WORKFLOW_REFERENCES.map((reference) => (
                <div key={reference.title} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">{reference.title}</p>
                  <p className="mt-1 text-xs text-white/65">{reference.assets}</p>
                  <p className="mt-1 text-xs text-white/55">{reference.notes}</p>
                </div>
              ))}
            </div>
            <Link
              href="/workflow"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Open workflow copies
            </Link>
          </article>
        </section>
      </div>
    </div>
  );
}
