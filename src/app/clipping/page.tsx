import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Clipping Tools",
  description: "Access clipping tools, templates, link-to-ad references and workflows.",
  robots: { index: false, follow: false },
};

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
            <h2 className="text-base font-semibold text-white">Link to Ad (templates)</h2>
            <p className="mt-2 text-sm text-white/65">
              Browse all Link to Ad templates published from My Projects. Each template opens a
              specific Link to Ad run so clippers can reuse proven project setups.
            </p>
            <Link
              href="/clipping/link-to-ad"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Open Link to Ad templates
            </Link>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-base font-semibold text-white">Workflow (templates + downloads)</h2>
            <p className="mt-2 text-sm text-white/65">
              All workflow templates are accessible from clipping in read-only mode so clippers can
              review the process and download supporting images/videos where available.
            </p>
            <Link
              href="/clipping/workflow"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Open all workflow templates
            </Link>
          </article>
        </section>
      </div>
    </div>
  );
}
